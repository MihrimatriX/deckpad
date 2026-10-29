using System.Text;
using StudioHub.Core;
using StudioHub.Core.Helper;
using StudioHub.Core.Obs;
using StudioHub.Dev;

namespace StudioHub.Core.Tests;

public class KeyComboTests
{
    [Fact]
    public void ParsesModifiersAndFunctionKey()
    {
        var c = KeyCombo.Parse("ctrl+shift+f5");
        Assert.Equal([KeyCombo.VK_CONTROL, KeyCombo.VK_SHIFT], c.Modifiers);
        Assert.Equal(0x74, c.Key);
        Assert.Equal("Ctrl+Shift+F5", c.Display);
    }

    [Theory]
    [InlineData("Ctrl++", 0xBB)]
    [InlineData("Alt+Sağ", 0x27)]
    [InlineData("Win+D", 'D')]
    [InlineData("Boşluk", 0x20)]
    [InlineData("MediaPlayPause", 0xB3)]
    public void ParsesSpecialKeys(string text, int vk) => Assert.Equal(vk, KeyCombo.Parse(text).Key);

    [Fact]
    public void ModifierOnlyBecomesKey()
    {
        var c = KeyCombo.Parse("Win");
        Assert.Empty(c.Modifiers);
        Assert.Equal(KeyCombo.VK_LWIN, c.Key);
    }

    [Theory]
    [InlineData("")]
    [InlineData("Ctrl+Foo")]
    [InlineData("A+B")]
    public void RejectsInvalid(string text) => Assert.Throws<FormatException>(() => KeyCombo.Parse(text));
}

public class PairingTests
{
    [Fact]
    public void RoundTrips()
    {
        var p = new PairInfo("192.168.1.20", "Stüdyo PC", 4466, "abc123xyz", 4455, "p@ss&=");
        var uri = p.ToUri();
        Assert.StartsWith("studiohub://pair?", uri);
        Assert.Equal(p, PairInfo.Parse(uri));
    }

    [Theory]
    [InlineData("obsws://1.2.3.4:4455/x")]
    [InlineData("studiohub://pair?host=1.2.3.4")]
    public void RejectsOtherCodes(string uri) => Assert.Null(PairInfo.Parse(uri));
}

public class DispatcherTests
{
    private readonly FakePc _pc = new();
    private PcActionDispatcher D => new(_pc);

    [Fact]
    public async Task OnlyHttpUrls()
    {
        Assert.False((await D.RunAsync(new PcAction { Op = "url", Url = "file:///C:/Windows/System32/cmd.exe" })).Ok);
        Assert.False((await D.RunAsync(new PcAction { Op = "url", Url = "javascript:alert(1)" })).Ok);
        Assert.True((await D.RunAsync(new PcAction { Op = "url", Url = "https://example.com" })).Ok);
    }

    [Fact]
    public async Task VolumeIsClamped()
    {
        var r = await D.RunAsync(new PcAction { Op = "volume", Mode = "set", Value = 250 });
        Assert.True(r.Ok);
        Assert.Equal("%100", r.Message);
        r = await D.RunAsync(new PcAction { Op = "volume", Mode = "toggleMute" });
        Assert.Equal("Sessiz", r.Message);
    }

    [Fact]
    public async Task ReportsBadInput()
    {
        Assert.Equal("Bilinmeyen eylem: rm", (await D.RunAsync(new PcAction { Op = "rm" })).Message);
        Assert.Contains("Tanınmayan tuş", (await D.RunAsync(new PcAction { Op = "keys", Keys = "Ctrl+Zz" })).Message);
        Assert.False((await D.RunAsync(new PcAction { Op = "text", Text = new string('a', 2001) })).Ok);
        Assert.False((await D.RunAsync(new PcAction { Op = "slide", Dir = "sideways" })).Ok);
        Assert.Empty(_pc.Calls);
    }

    [Fact]
    public async Task LaunchTrimsQuotes()
    {
        await D.RunAsync(new PcAction { Op = "launch", Path = "\"C:\\Program Files\\App\\app.exe\" " });
        Assert.Equal("launch C:\\Program Files\\App\\app.exe", _pc.Calls.Single());
    }
}

public class SettingsTests
{
    [Fact]
    public void CorruptFileFallsBackToDefaults()
    {
        var dir = Directory.CreateTempSubdirectory().FullName;
        var path = Path.Combine(dir, "settings.json");
        File.WriteAllText(path, "{ bozuk");
        var s = HubSettings.Load(path);
        Assert.Equal(4466, s.HubPort);
        Assert.True(s.PairToken.Length >= 12);
    }

    [Fact]
    public void NormalizesValues()
    {
        var dir = Directory.CreateTempSubdirectory().FullName;
        var path = Path.Combine(dir, "settings.json");
        // Eski sürümlerin webcam alanları yok sayılır, dosya yine okunur.
        File.WriteAllText(path, """{"hubPort": 80, "pairToken": "x", "deviceName": "Eski PC", "webcamPort": 9100, "webcam": {"width": 1000}}""");
        var s = HubSettings.Load(path);
        Assert.Equal(4466, s.HubPort);
        Assert.NotEqual("x", s.PairToken);
        Assert.Equal("Eski PC", s.DeviceName);
    }
}

public class IniFileTests
{
    [Fact]
    public void ChangesOnlyTheKey()
    {
        var dir = Directory.CreateTempSubdirectory().FullName;
        var path = Path.Combine(dir, "user.ini");
        var original = "[General]\r\nName=Test\r\n\r\n[BasicWindow]\r\ngeometry=AdnQyw\r\nDockState=AAA\r\n\r\n[Other]\r\nx=1\r\n";
        File.WriteAllBytes(path, [0xEF, 0xBB, 0xBF, .. Encoding.UTF8.GetBytes(original)]);
        var ini = IniFile.Load(path);
        ini.Set("BasicWindow", "ExtraBrowserDocks", "[]");
        ini.Set("General", "Name", "Yeni");
        ini.Save(path);
        var bytes = File.ReadAllBytes(path);
        Assert.Equal(0xEF, bytes[0]);
        var text = Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
        Assert.Equal("[General]\r\nName=Yeni\r\n\r\n[BasicWindow]\r\ngeometry=AdnQyw\r\nDockState=AAA\r\nExtraBrowserDocks=[]\r\n\r\n[Other]\r\nx=1\r\n", text);
    }

    [Fact]
    public void AddsMissingSection()
    {
        var ini = IniFile.Parse("[A]\nk=v\n");
        ini.Set("B", "z", "1");
        Assert.Equal("1", ini.Get("B", "z"));
        Assert.Equal("v", ini.Get("A", "k"));
        Assert.Null(ini.Get("A", "z"));
    }
}

public class ObsConfiguratorTests
{
    private readonly string _root = Directory.CreateTempSubdirectory().FullName;
    private bool _running;

    private ObsConfigurator Make()
    {
        var cfg = Path.Combine(_root, "obs-studio");
        Directory.CreateDirectory(Path.Combine(cfg, "basic", "scenes"));
        File.WriteAllText(Path.Combine(cfg, "user.ini"), "[Basic]\r\nSceneCollection=Sahnelerim\r\nSceneCollectionFile=Sahnelerim\r\n\r\n[BasicWindow]\r\ngeometry=abc\r\n");
        File.WriteAllText(Path.Combine(cfg, "basic", "scenes", "Sahnelerim.json"), """{"name":"Sahnelerim","sources":[],"modules":{"auto-scene-switcher":{"active":false}}}""");
        return new ObsConfigurator(cfg, () => _running);
    }

    [Fact]
    public void KeepsExistingWebSocketPassword()
    {
        var o = Make();
        var wsDir = Path.Combine(o.ConfigDir, "plugin_config", "obs-websocket");
        Directory.CreateDirectory(wsDir);
        File.WriteAllText(Path.Combine(wsDir, "config.json"), """{"server_enabled":false,"server_port":4455,"auth_required":true,"server_password":"eskiSifre","alerts_enabled":true}""");
        var (step, pass) = o.EnableWebSocket(4455, "yeni");
        Assert.True(step.Ok);
        Assert.Equal("eskiSifre", pass);
        Assert.Equal((true, 4455), o.ReadWebSocket());
        Assert.Contains("\"alerts_enabled\": true", File.ReadAllText(Path.Combine(wsDir, "config.json")));
    }

    [Fact]
    public void WritesLegacyAndNewWebSocketConfig()
    {
        var o = Make();
        File.WriteAllText(Path.Combine(o.ConfigDir, "global.ini"), "[General]\r\nFirstRun=true\r\n\r\n[OBSWebSocket]\r\nServerPassword=eskiIni\r\nAuthRequired=true\r\nServerEnabled=false\r\n");
        var (step, pass) = o.EnableWebSocket(4456, null);
        Assert.True(step.Ok);
        Assert.Equal("eskiIni", pass);
        var ini = IniFile.Load(Path.Combine(o.ConfigDir, "global.ini"));
        Assert.Equal("true", ini.Get("OBSWebSocket", "ServerEnabled"));
        Assert.Equal("4456", ini.Get("OBSWebSocket", "ServerPort"));
        Assert.Equal("false", ini.Get("OBSWebSocket", "FirstLoad"));
        Assert.Equal("true", ini.Get("General", "FirstRun"));
        Assert.Contains("eskiIni", File.ReadAllText(Path.Combine(o.ConfigDir, "plugin_config", "obs-websocket", "config.json")));
        Assert.Equal((true, 4456), o.ReadWebSocket());
    }

    [Fact]
    public void CreatesWebSocketConfigWithPassword()
    {
        var (step, pass) = Make().EnableWebSocket(4460, null);
        Assert.True(step.Ok);
        Assert.Equal(12, pass!.Length);
    }

    [Fact]
    public void DockIsAddedOnce()
    {
        var o = Make();
        Assert.True(o.AddDock("http://127.0.0.1:4466/?mode=dock").Ok);
        Assert.True(o.AddDock("http://127.0.0.1:4470/?mode=dock").Ok);
        Assert.Equal("http://127.0.0.1:4470/?mode=dock", o.DockUrl());
        var ini = File.ReadAllText(Path.Combine(o.ConfigDir, "user.ini"));
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(ini, "DeckPad"));
        Assert.Contains("geometry=abc", ini);
    }

    [Fact]
    public void ScriptIsAddedToCurrentCollection()
    {
        var o = Make();
        var script = Path.Combine(_root, "deckpad.lua");
        File.WriteAllText(script, "-- test");
        Assert.True(o.AddScript(script).Ok);
        Assert.True(o.AddScript(script).Ok);
        var json = File.ReadAllText(Path.Combine(o.ConfigDir, "basic", "scenes", "Sahnelerim.json"));
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(json, "deckpad.lua"));
        Assert.Contains("auto-scene-switcher", json);
        Assert.NotNull(o.ScriptPathInCollection());
        Assert.True(File.Exists(Path.Combine(o.ConfigDir, "basic", "scenes", "Sahnelerim.json.deckpad-yedek")));
    }

    [Fact]
    public void Obs32CollectionAndOldScriptName()
    {
        var o = Make();
        // OBS 32 koleksiyon adını uzantısıyla yazar; webcam'li sürüm betiği eski adla eklemiş olabilir.
        var ini = Path.Combine(o.ConfigDir, "user.ini");
        File.WriteAllText(ini, File.ReadAllText(ini).Replace("SceneCollectionFile=Sahnelerim", "SceneCollectionFile=Sahnelerim.json"));
        var collection = Path.Combine(o.ConfigDir, "basic", "scenes", "Sahnelerim.json");
        File.WriteAllText(collection, """{"name":"Sahnelerim","modules":{"scripts-tool":[{"path":"C:/eski/deckpad-camlink.lua","settings":{"sfx_dir":"C:/Sesler"}}]}}""");
        var script = Path.Combine(_root, "deckpad.lua");
        File.WriteAllText(script, "-- test");
        Assert.True(o.AddScript(script).Ok);
        var json = File.ReadAllText(collection);
        Assert.DoesNotContain("deckpad-camlink.lua", json);
        Assert.Contains("C:/Sesler", json);
        Assert.NotNull(o.ScriptPathInCollection());
        Assert.Equal("Sahnelerim", o.CurrentSceneCollectionFile());
    }

    [Fact]
    public void RefusesWhileObsRuns()
    {
        var o = Make();
        _running = true;
        var (steps, _) = o.Setup(new SetupRequest(true, 4455, null, "http://x", null));
        Assert.Equal("obs-running", steps.Single().Id);
        Assert.False(File.Exists(Path.Combine(o.ConfigDir, "plugin_config", "obs-websocket", "config.json")));
    }
}
