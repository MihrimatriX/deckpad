using System.Text.Json;
using System.Text.Json.Nodes;

namespace StudioHub.Core.Obs;

public sealed record SetupStep(string Id, string Title, bool Ok, string Message);

public sealed record ObsStatus(
    bool ConfigFound,
    bool Running,
    bool WebSocketEnabled,
    int? WebSocketPort,
    bool DockAdded,
    bool ScriptAdded,
    string? SceneCollection);

/// <summary>
/// OBS kapalıyken yapılandırma dosyalarını düzenleyerek OBS'i DeckPad için hazırlar:
/// WebSocket sunucusunu açar, DeckPad panelini ekler ve kurulum betiğini yerleştirir.
/// </summary>
public sealed class ObsConfigurator
{
    public const string DockTitle = "DeckPad";
    private readonly string _configDir;
    private readonly Func<bool> _isRunning;

    /// <param name="configDir">%APPDATA%\obs-studio</param>
    public ObsConfigurator(string configDir, Func<bool> isRunning)
    {
        _configDir = configDir;
        _isRunning = isRunning;
    }

    public static ObsConfigurator ForCurrentUser(Func<bool> isRunning) => new(
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "obs-studio"),
        isRunning);

    public string ConfigDir => _configDir;
    private string WebSocketConfig => Path.Combine(_configDir, "plugin_config", "obs-websocket", "config.json");

    /// <summary>OBS 31 ve sonrası pencere ayarlarını user.ini'de, öncekiler global.ini'de tutar.</summary>
    private string UiIni
    {
        get
        {
            var user = Path.Combine(_configDir, "user.ini");
            return File.Exists(user) ? user : Path.Combine(_configDir, "global.ini");
        }
    }

    public ObsStatus Status()
    {
        var found = Directory.Exists(_configDir);
        var (wsOn, wsPort) = ReadWebSocket();
        return new ObsStatus(
            found,
            SafeRunning(),
            wsOn,
            wsPort,
            DockUrl() != null,
            ScriptPathInCollection() != null,
            CurrentSceneCollectionFile());
    }

    private bool SafeRunning()
    {
        try { return _isRunning(); }
        catch { return false; }
    }

    // ---------- WebSocket ----------

    private string GlobalIni => Path.Combine(_configDir, "global.ini");
    private const string WsSection = "OBSWebSocket";

    /// <summary>
    /// obs-websocket 5.3 ve öncesi (OBS 30.0/30.1) ayarları global.ini'nin [OBSWebSocket] bölümünde,
    /// sonrası plugin_config/obs-websocket/config.json'da tutar. Yeni sürüm global.ini'de değer bulursa
    /// onları taşır ve config.json'un önüne koyar; bu yüzden ikisi birlikte yazılır, önce global.ini okunur.
    /// </summary>
    public (bool enabled, int? port) ReadWebSocket()
    {
        try
        {
            var ini = IniFile.Load(GlobalIni);
            var legacyEnabled = ini.Get(WsSection, "ServerEnabled");
            if (legacyEnabled != null)
            {
                var port = int.TryParse(ini.Get(WsSection, "ServerPort"), out var lp) ? lp : (int?)null;
                return (legacyEnabled.Equals("true", StringComparison.OrdinalIgnoreCase), port);
            }
            if (!File.Exists(WebSocketConfig)) return (false, null);
            var o = JsonNode.Parse(File.ReadAllText(WebSocketConfig)) as JsonObject;
            return (o?["server_enabled"]?.GetValue<bool>() == true, o?["server_port"]?.GetValue<int>());
        }
        catch
        {
            return (false, null);
        }
    }

    /// <summary>OBS'in şu an kullandığı WebSocket şifresi (kimlik doğrulama kapalıysa ya da ayar yoksa null).</summary>
    public string? ExistingPassword()
    {
        try
        {
            var ini = IniFile.Load(GlobalIni);
            var legacy = ini.Get(WsSection, "ServerPassword");
            var legacyAuth = ini.Get(WsSection, "AuthRequired");
            if (!string.IsNullOrEmpty(legacy) && !"false".Equals(legacyAuth, StringComparison.OrdinalIgnoreCase)) return legacy;
            if (!File.Exists(WebSocketConfig)) return null;
            var o = JsonNode.Parse(File.ReadAllText(WebSocketConfig)) as JsonObject;
            var pass = o?["server_password"]?.GetValue<string>();
            var auth = o?["auth_required"]?.GetValue<bool>() ?? true;
            return !string.IsNullOrEmpty(pass) && auth ? pass : null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>WebSocket sunucusunu şifreli olarak açar. Mevcut şifre varsa korunur; yoksa üretilir.</summary>
    public (SetupStep step, string? password) EnableWebSocket(int port, string? preferredPassword)
    {
        const string id = "websocket", title = "WebSocket sunucusu";
        try
        {
            var password = ExistingPassword() ?? (!string.IsNullOrEmpty(preferredPassword) ? preferredPassword : HubSettings.NewToken()[..12]);

            // Yeni sürümler: config.json
            var o = File.Exists(WebSocketConfig) ? JsonNode.Parse(File.ReadAllText(WebSocketConfig)) as JsonObject ?? new JsonObject() : new JsonObject();
            o["server_enabled"] = true;
            o["server_port"] = port;
            o["auth_required"] = true;
            o["server_password"] = password;
            o["alerts_enabled"] = o["alerts_enabled"]?.GetValue<bool>() ?? false;
            // İlk açılışta rastgele yeni şifre üretilmesini engeller.
            o["first_load"] = false;
            Directory.CreateDirectory(Path.GetDirectoryName(WebSocketConfig)!);
            File.WriteAllText(WebSocketConfig, o.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));

            // Eski sürümler: global.ini [OBSWebSocket]
            var ini = IniFile.Load(GlobalIni);
            ini.Set(WsSection, "FirstLoad", "false");
            ini.Set(WsSection, "ServerEnabled", "true");
            ini.Set(WsSection, "ServerPort", port.ToString());
            ini.Set(WsSection, "AuthRequired", "true");
            ini.Set(WsSection, "ServerPassword", password);
            if (ini.Get(WsSection, "AlertsEnabled") == null) ini.Set(WsSection, "AlertsEnabled", "false");
            ini.Save(GlobalIni);

            return (new SetupStep(id, title, true, $"Port {port}, şifreli"), password);
        }
        catch (Exception e)
        {
            return (new SetupStep(id, title, false, e.Message), null);
        }
    }

    // ---------- DeckPad paneli (özel tarayıcı paneli) ----------

    public string? DockUrl()
    {
        var arr = ReadDocks();
        return arr?.OfType<JsonObject>().FirstOrDefault(d => d["title"]?.GetValue<string>() == DockTitle)?["url"]?.GetValue<string>();
    }

    private JsonArray? ReadDocks()
    {
        try
        {
            var raw = IniFile.Load(UiIni).Get("BasicWindow", "ExtraBrowserDocks");
            return string.IsNullOrWhiteSpace(raw) ? null : JsonNode.Parse(raw) as JsonArray;
        }
        catch
        {
            return null;
        }
    }

    public SetupStep AddDock(string url)
    {
        const string id = "dock", title = "DeckPad paneli";
        try
        {
            var path = UiIni;
            var ini = IniFile.Load(path);
            var arr = ReadDocks() ?? [];
            var existing = arr.OfType<JsonObject>().FirstOrDefault(d => d["title"]?.GetValue<string>() == DockTitle);
            if (existing != null) existing["url"] = url;
            else arr.Add(new JsonObject { ["title"] = DockTitle, ["url"] = url, ["uuid"] = Guid.NewGuid().ToString("D") });
            ini.Set("BasicWindow", "ExtraBrowserDocks", arr.ToJsonString());
            ini.Save(path);
            return new SetupStep(id, title, true, existing != null ? "Adres güncellendi" : "Eklendi; OBS'te Paneller menüsünden açılır");
        }
        catch (Exception e)
        {
            return new SetupStep(id, title, false, e.Message);
        }
    }

    // ---------- Kurulum betiği ----------

    public string? CurrentSceneCollectionFile()
    {
        foreach (var name in new[] { "user.ini", "global.ini" })
        {
            var p = Path.Combine(_configDir, name);
            if (!File.Exists(p)) continue;
            var file = IniFile.Load(p).Get("Basic", "SceneCollectionFile");
            // OBS 32 adı uzantısıyla yazar (Untitled.json), OBS 30 uzantısız (Untitled).
            if (!string.IsNullOrWhiteSpace(file)) return file.EndsWith(".json", StringComparison.OrdinalIgnoreCase) ? file[..^5] : file;
        }
        return null;
    }

    private string? SceneCollectionPath()
    {
        var file = CurrentSceneCollectionFile();
        return file == null ? null : Path.Combine(_configDir, "basic", "scenes", file + ".json");
    }

    public string? ScriptPathInCollection()
    {
        try
        {
            var p = SceneCollectionPath();
            if (p == null || !File.Exists(p)) return null;
            var root = JsonNode.Parse(File.ReadAllText(p)) as JsonObject;
            var scripts = root?["modules"]?["scripts-tool"] as JsonArray;
            return scripts?.OfType<JsonObject>()
                .Select(s => s["path"]?.GetValue<string>())
                .FirstOrDefault(s => s != null && s.EndsWith("deckpad.lua", StringComparison.OrdinalIgnoreCase));
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Betiği OBS'in betik klasörüne kopyalar ve geçerli sahne koleksiyonuna ekler.</summary>
    public SetupStep AddScript(string scriptSource)
    {
        const string id = "script", title = "Kurulum betiği";
        try
        {
            if (!File.Exists(scriptSource)) return new SetupStep(id, title, false, "Betik dosyası uygulama klasöründe bulunamadı");
            var scriptsDir = Path.Combine(_configDir, "scripts");
            Directory.CreateDirectory(scriptsDir);
            var target = Path.Combine(scriptsDir, "deckpad.lua");
            File.Copy(scriptSource, target, overwrite: true);

            var collection = SceneCollectionPath();
            if (collection == null || !File.Exists(collection))
                return new SetupStep(id, title, true, "Kopyalandı. OBS'te Araçlar › Betikler'den eklenmeli");

            var root = JsonNode.Parse(File.ReadAllText(collection)) as JsonObject ?? throw new InvalidDataException("Sahne koleksiyonu okunamadı");
            var modules = root["modules"] as JsonObject ?? new JsonObject();
            root["modules"] = modules;
            var scripts = modules["scripts-tool"] as JsonArray ?? [];
            modules["scripts-tool"] = scripts;
            // Webcam'li sürümün betiği (deckpad-camlink.lua) çıkarılır; ayarları yeni betiğe geçer.
            var old = scripts.OfType<JsonObject>()
                .Where(s => s["path"]?.GetValue<string>()?.EndsWith("deckpad-camlink.lua", StringComparison.OrdinalIgnoreCase) == true).ToList();
            foreach (var s in old) scripts.Remove(s);
            // OBS yollarda ileri eğik çizgi kullanır.
            var obsPath = target.Replace('\\', '/');
            if (!scripts.OfType<JsonObject>().Any(s => string.Equals(s["path"]?.GetValue<string>(), obsPath, StringComparison.OrdinalIgnoreCase)))
                scripts.Add(new JsonObject { ["path"] = obsPath, ["settings"] = old.FirstOrDefault()?["settings"]?.DeepClone() ?? new JsonObject() });
            File.Copy(collection, collection + ".deckpad-yedek", overwrite: true);
            File.WriteAllText(collection, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            return new SetupStep(id, title, true, $"\"{CurrentSceneCollectionFile()}\" koleksiyonuna eklendi");
        }
        catch (Exception e)
        {
            return new SetupStep(id, title, false, e.Message);
        }
    }

    /// <summary>Seçilen adımları sırayla uygular. OBS açıkken dosyalara dokunmaz.</summary>
    public (List<SetupStep> steps, string? password) Setup(SetupRequest req)
    {
        var steps = new List<SetupStep>();
        string? password = null;
        if (SafeRunning())
        {
            steps.Add(new SetupStep("obs-running", "OBS açık", false, "Ayarları yazabilmek için önce OBS'i kapat"));
            return (steps, null);
        }
        if (!Directory.Exists(_configDir))
        {
            steps.Add(new SetupStep("obs-missing", "OBS bulunamadı", false, "OBS'i bir kez açıp kapat, sonra tekrar dene"));
            return (steps, null);
        }
        if (req.WebSocket)
        {
            var (s, p) = EnableWebSocket(req.WebSocketPort, req.PreferredPassword);
            steps.Add(s);
            password = p;
        }
        if (req.DockUrl != null) steps.Add(AddDock(req.DockUrl));
        if (req.ScriptSource != null) steps.Add(AddScript(req.ScriptSource));
        return (steps, password);
    }
}

public sealed record SetupRequest(
    bool WebSocket,
    int WebSocketPort,
    string? PreferredPassword,
    string? DockUrl,
    string? ScriptSource);
