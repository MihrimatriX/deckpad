using System.Net;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using QRCoder;
using StudioHub.Core.Discovery;
using StudioHub.Core.Helper;
using StudioHub.Core.Net;
using StudioHub.Core.Obs;
using StudioHub.Core.Webcam;

namespace StudioHub.Core.Server;

public sealed class HubOptions
{
    public required string SettingsPath { get; init; }
    public required string DeckPath { get; init; }

    /// <summary>DeckPad'in web derlemesi (masaüstü ve OBS paneli).</summary>
    public required string PanelRoot { get; init; }

    /// <summary>StudioHub yönetim arayüzü.</summary>
    public required string AdminRoot { get; init; }

    /// <summary>CamLink OBS eklentisinin dosyaları (obs-plugins yapısıyla).</summary>
    public string? PluginSource { get; init; }

    /// <summary>OBS kurulum betiği (deckpad-camlink.lua).</summary>
    public string? ScriptSource { get; init; }

    public required string FfmpegPath { get; init; }
    public string Version { get; init; } = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0";

    /// <summary>Port açılamazsa Kestrel'in hatası bu adla gösterilir.</summary>
    public bool LogToConsole { get; init; }

    /// <summary>Testler için: yerel ağdan gelen istekleri de yerel saymaz.</summary>
    public Func<IPAddress?, bool>? IsLocal { get; init; }
}

/// <summary>
/// StudioHub'ın kalbi: tek porttan DeckPad panelini, yönetim arayüzünü, yerel API'yi ve
/// telefonların bağlandığı WebSocket'i sunar; ağ duyurusunu ve webcam alıcısını yönetir.
/// </summary>
public sealed class HubHost : IAsyncDisposable
{
    public const string ApiHeader = "X-StudioHub";

    private readonly HubOptions _o;
    private readonly IHubPlatform _platform;
    private readonly object _settingsLock = new();
    private WebApplication? _app;
    private Beacon? _beacon;

    public HubSettings Settings { get; private set; }
    public HelperHub Helper { get; }
    public WebcamService Webcam { get; }
    public ObsConfigurator Obs { get; }
    public DeckStore Deck { get; }
    public int Port { get; private set; }
    public string? StartError { get; private set; }

    /// <summary>Kabuğun tepsi simgesini güncellemesi için.</summary>
    public event Action? StatusChanged;

    public HubHost(HubOptions options, IHubPlatform platform, IPcPlatform pc, IFrameSink sink, ObsConfigurator obs)
    {
        _o = options;
        _platform = platform;
        Settings = HubSettings.Load(options.SettingsPath);
        Deck = new DeckStore(options.DeckPath);
        Helper = new HelperHub(() => Settings, new PcActionDispatcher(pc), Deck);
        Helper.ClientsChanged += () => StatusChanged?.Invoke();
        Webcam = new WebcamService(options.FfmpegPath, sink, () => Settings.Webcam, () => Settings.WebcamPort);
        Obs = obs;
    }

    public string BaseUrl => $"http://127.0.0.1:{Port}";

    public PairInfo Pair(string? host = null) => PairInfo.From(Settings, host ?? NetInfo.PrimaryAddress());

    public async Task StartAsync()
    {
        Port = Settings.HubPort;
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ContentRootPath = AppContext.BaseDirectory,
            Args = [],
        });
        builder.Logging.ClearProviders();
        if (_o.LogToConsole) builder.Logging.AddSimpleConsole(c => c.SingleLine = true).SetMinimumLevel(LogLevel.Warning);
        builder.WebHost.ConfigureKestrel(k =>
        {
            k.ListenAnyIP(Port);
            k.Limits.MaxRequestBodySize = 4 * 1024 * 1024;
        });
        builder.Services.ConfigureHttpJsonOptions(j =>
        {
            j.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        });

        var app = builder.Build();
        Configure(app);
        try
        {
            await app.StartAsync();
        }
        catch (IOException e)
        {
            StartError = $"Port {Port} kullanımda. StudioHub zaten açık olabilir ya da başka bir uygulama bu portu kullanıyor. ({e.Message})";
            await app.DisposeAsync();
            throw new InvalidOperationException(StartError, e);
        }
        _app = app;

        _beacon = new Beacon(BeaconPayload);
        _beacon.Start();
        Webcam.StartIdleFrames();
        if (Settings.Webcam.AutoStart) Webcam.Start();
    }

    internal object BeaconPayload() => new
    {
        app = "studiohub",
        v = 1,
        name = Settings.DeviceName,
        hub = Settings.HubPort,
        webcam = Settings.WebcamPort,
        webcamOn = Webcam.State is WebcamState.Waiting or WebcamState.Receiving,
        webcamBusy = Webcam.State == WebcamState.Receiving,
        obsSrt = Settings.ObsSrtPort,
        obsWs = Settings.ObsWebSocketPort,
    };

    private bool IsLocal(HttpContext c) =>
        _o.IsLocal?.Invoke(c.Connection.RemoteIpAddress) ?? NetInfo.IsLoopback(c.Connection.RemoteIpAddress);

    private void Configure(WebApplication app)
    {
        // DNS yeniden bağlama saldırılarına karşı: Host başlığı yalnızca IP ya da localhost olabilir.
        app.Use(async (c, next) =>
        {
            var host = c.Request.Host.Host;
            if (!(host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || IPAddress.TryParse(host.Trim('[', ']'), out _)))
            {
                c.Response.StatusCode = 421;
                return;
            }
            c.Response.Headers["X-Content-Type-Options"] = "nosniff";
            c.Response.Headers["Referrer-Policy"] = "no-referrer";
            await next();
        });

        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });

        // Yerel API: yalnızca bu bilgisayardan ve özel başlıkla (tarayıcıdan sahte istekleri engeller).
        app.Use(async (c, next) =>
        {
            var path = c.Request.Path;
            var isApi = path.StartsWithSegments("/api");
            var isAdmin = path.StartsWithSegments("/hub") || path.StartsWithSegments("/panel-config.json");
            if ((isApi || isAdmin) && !IsLocal(c))
            {
                c.Response.StatusCode = 403;
                await c.Response.WriteAsync("Bu sayfa yalnızca bilgisayarın kendisinden açılabilir.");
                return;
            }
            // Göreli dosya adresleri doğru çözülsün diye /hub her zaman /hub/ olarak açılır.
            if (path.Value == "/hub")
            {
                c.Response.Redirect("/hub/");
                return;
            }
            if (isApi && !c.Request.Headers.ContainsKey(ApiHeader))
            {
                c.Response.StatusCode = 400;
                await c.Response.WriteAsync("X-StudioHub başlığı gerekli");
                return;
            }
            await next();
        });

        app.Map("/ws", (HttpContext c) => HandleWs(c));
        MapApi(app);

        app.MapGet("/panel-config.json", (HttpContext c) =>
        {
            c.Response.Headers.CacheControl = "no-store";
            return Results.Json(new
            {
                obs = new { host = "127.0.0.1", port = Settings.ObsWebSocketPort, password = Settings.ObsPassword ?? "" },
                hub = new { url = $"ws://127.0.0.1:{Port}/ws", token = Settings.PairToken, name = Settings.DeviceName },
                storage = "hub",
            });
        });

        Static(app, "/hub", _o.AdminRoot, spa: false);
        Static(app, "", _o.PanelRoot, spa: true);
    }

    private static void Static(WebApplication app, string prefix, string root, bool spa)
    {
        if (!Directory.Exists(root))
        {
            app.MapGet(prefix + "/{**rest}", () => Results.Text($"Arayüz dosyaları bulunamadı: {root}", statusCode: 500));
            return;
        }
        var fp = new PhysicalFileProvider(root);
        // Yönlendirme statik dosyalardan önce çalıştığı için klasör adresleri index.html'e elle bağlanır.
        if (!spa)
        {
            app.MapGet(prefix + "/", async c =>
            {
                c.Response.ContentType = "text/html; charset=utf-8";
                c.Response.Headers.CacheControl = "no-cache";
                await c.Response.SendFileAsync(Path.Combine(root, "index.html"));
            });
        }
        app.UseStaticFiles(new StaticFileOptions
        {
            RequestPath = prefix,
            FileProvider = fp,
            OnPrepareResponse = ctx =>
            {
                // index.html her seferinde yenilensin; diğer dosyalar adlarında sürüm taşır.
                var name = ctx.File.Name;
                ctx.Context.Response.Headers.CacheControl = name.EndsWith(".html") ? "no-cache" : "public, max-age=3600";
            },
        });
        if (spa)
        {
            app.MapFallback(async c =>
            {
                if (c.Request.Path.StartsWithSegments("/api") || c.Request.Path.StartsWithSegments("/hub"))
                {
                    c.Response.StatusCode = 404;
                    return;
                }
                c.Response.ContentType = "text/html; charset=utf-8";
                c.Response.Headers.CacheControl = "no-cache";
                await c.Response.SendFileAsync(Path.Combine(root, "index.html"));
            });
        }
    }

    private async Task HandleWs(HttpContext c)
    {
        if (!c.WebSockets.IsWebSocketRequest)
        {
            c.Response.StatusCode = 400;
            return;
        }
        using var ws = await c.WebSockets.AcceptWebSocketAsync();
        await Helper.HandleAsync(ws, c.Connection.RemoteIpAddress, c.RequestAborted);
    }

    // ---------------- API ----------------

    private void MapApi(WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/status", () => Results.Json(StatusObject()));

        api.MapGet("/qr.svg", (string? host) =>
        {
            var uri = Pair(host).ToUri();
            using var gen = new QRCodeGenerator();
            using var data = gen.CreateQrCode(uri, QRCodeGenerator.ECCLevel.M);
            var svg = new SvgQRCode(data).GetGraphic(8, "#0B1530", "#DCE7FF", drawQuietZones: true);
            return Results.Text(svg, "image/svg+xml");
        });

        api.MapPost("/obs/setup", async (ObsSetupBody b) =>
        {
            var dockUrl = b.Dock ? $"http://127.0.0.1:{Port}/?mode=dock" : null;
            var (steps, password) = Obs.Setup(new SetupRequest(
                b.WebSocket, Settings.ObsWebSocketPort, Settings.ObsPassword, dockUrl,
                b.Plugin ? _o.PluginSource : null, b.Script ? _o.ScriptSource : null));

            // Eklenti klasörüne yazmak yönetici izni ister; reddedilirse yükseltilmiş kopyalama denenir.
            var pluginStep = steps.FindIndex(s => s.Id == "plugin" && !s.Ok && s.Message == "yönetici-gerekli");
            if (pluginStep >= 0 && _o.PluginSource != null)
            {
                var r = await _platform.RunElevatedAsync(new ElevatedRequest(PluginSource: _o.PluginSource, PluginTarget: Obs.PluginDir));
                steps[pluginStep] = r.FirstOrDefault(s => s.Id == "plugin") ?? steps[pluginStep] with { Message = "Yönetici izni verilmedi" };
            }
            if (password != null) UpdateSettings(s => s.ObsPassword = password);
            StatusChanged?.Invoke();
            return Results.Json(new { steps, status = Obs.Status() });
        });

        api.MapPost("/obs/launch", async () =>
        {
            if (!_platform.CanLaunchObs) return Results.Json(new { ok = false, message = "OBS bulunamadı" });
            await _platform.LaunchObsAsync();
            return Results.Json(new { ok = true });
        });

        api.MapPost("/webcam/start", () =>
        {
            Webcam.Start();
            UpdateSettings(s => s.Webcam.AutoStart = true);
            return Results.Json(WebcamObject());
        });

        api.MapPost("/webcam/stop", async () =>
        {
            await Webcam.StopAsync();
            UpdateSettings(s => s.Webcam.AutoStart = false);
            return Results.Json(WebcamObject());
        });

        api.MapPut("/webcam/settings", async (WebcamSettings body) =>
        {
            var running = Webcam.State != WebcamState.Stopped;
            UpdateSettings(s =>
            {
                body.AutoStart = s.Webcam.AutoStart;
                body.Normalize();
                s.Webcam = body;
            });
            if (running) await Webcam.RestartAsync();
            return Results.Json(WebcamObject());
        });

        api.MapPost("/webcam/driver", async (DriverBody b) =>
        {
            var steps = await _platform.RunElevatedAsync(b.Install
                ? new ElevatedRequest(InstallDriver: true, DriverName: Webcam.Sink.DeviceName)
                : new ElevatedRequest(UninstallDriver: true));
            StatusChanged?.Invoke();
            return Results.Json(new { steps, webcam = WebcamObject() });
        });

        api.MapGet("/webcam/preview.bmp", (HttpContext c) =>
        {
            c.Response.Headers.CacheControl = "no-store";
            var bmp = Webcam.PreviewBmp();
            return bmp == null ? Results.NoContent() : Results.Bytes(bmp, "image/bmp");
        });

        api.MapPost("/firewall", async () =>
        {
            var s = Settings;
            var steps = await _platform.RunElevatedAsync(new ElevatedRequest(
                FirewallTcp: [s.HubPort],
                FirewallUdp: [s.WebcamPort, s.ObsSrtPort, Beacon.Port]));
            return Results.Json(new { steps, firewall = _platform.FirewallConfigured(Settings) });
        });

        api.MapPut("/settings", (SettingsBody b) =>
        {
            var restart = false;
            var webcamPortChanged = false;
            UpdateSettings(s =>
            {
                if (!string.IsNullOrWhiteSpace(b.DeviceName)) s.DeviceName = b.DeviceName.Trim()[..Math.Min(40, b.DeviceName.Trim().Length)];
                if (b.HubPort is int hp && hp != s.HubPort) { s.HubPort = hp; restart = true; }
                if (b.WebcamPort is int wp && wp != s.WebcamPort) { s.WebcamPort = wp; webcamPortChanged = true; }
                if (b.ObsSrtPort is int sp) s.ObsSrtPort = sp;
                if (b.ObsWebSocketPort is int op) s.ObsWebSocketPort = op;
                if (b.ObsPassword != null) s.ObsPassword = b.ObsPassword.Length == 0 ? null : b.ObsPassword;
                s.Normalize();
            });
            if (b.StartWithWindows is bool sw)
            {
                try { _platform.Autostart = sw; }
                catch (Exception e) { return Results.Json(new { ok = false, message = "Başlangıç ayarı yazılamadı: " + e.Message }); }
            }
            if (webcamPortChanged && Webcam.State != WebcamState.Stopped) _ = Webcam.RestartAsync();
            return Results.Json(new { ok = true, restartNeeded = restart, status = StatusObject() });
        });

        api.MapPost("/token/regenerate", async () =>
        {
            UpdateSettings(s => s.PairToken = HubSettings.NewToken());
            await Helper.DisconnectAllAsync("Eşleştirme kodu yenilendi");
            return Results.Json(new { ok = true });
        });

        api.MapPost("/panel/open", () =>
        {
            _platform.OpenPanelWindow();
            return Results.Json(new { ok = true });
        });

        api.MapPost("/open", (OpenBody b) =>
        {
            if (!Uri.TryCreate(b.Url, UriKind.Absolute, out var u) || u.Scheme is not ("http" or "https")) return Results.BadRequest();
            _platform.OpenExternal(u.ToString());
            return Results.Json(new { ok = true });
        });

        api.MapGet("/deck", () => Results.Json(new { deck = Deck.Read(), updatedAt = Deck.UpdatedAt?.ToUnixTimeMilliseconds() }));

        api.MapPut("/deck", async (HttpContext c) =>
        {
            JsonNode? body;
            try { body = await JsonNode.ParseAsync(c.Request.Body); }
            catch (JsonException) { return Results.BadRequest(new { ok = false, message = "JSON okunamadı" }); }
            var deck = body?["deck"];
            var origin = c.Request.Headers["X-Client-Id"].FirstOrDefault();
            var err = deck == null ? "Düzen boş" : Deck.Write(deck.DeepClone(), origin);
            return err == null ? Results.Json(new { ok = true }) : Results.BadRequest(new { ok = false, message = err });
        });
    }

    private void UpdateSettings(Action<HubSettings> change)
    {
        lock (_settingsLock)
        {
            change(Settings);
            Settings.Save(_o.SettingsPath);
        }
        StatusChanged?.Invoke();
    }

    public object WebcamObject() => new
    {
        state = Webcam.State.ToString().ToLowerInvariant(),
        error = Webcam.LastError,
        fps = Webcam.Fps,
        frames = Webcam.Frames,
        receivingSince = Webcam.ReceivingSince?.ToUnixTimeMilliseconds(),
        ffmpegFound = Webcam.FfmpegFound,
        driverInstalled = _platform.DriverInstalled,
        hasConsumer = SafeConsumer(),
        deviceName = Webcam.Sink.DeviceName,
        port = Settings.WebcamPort,
        settings = Settings.Webcam,
    };

    private bool SafeConsumer()
    {
        try { return Webcam.Sink.HasConsumer; }
        catch { return false; }
    }

    public object StatusObject()
    {
        var addrs = NetInfo.LanAddresses();
        var primary = addrs.FirstOrDefault()?.Address ?? "127.0.0.1";
        return new
        {
            version = _o.Version,
            os = _platform.OsName,
            name = Settings.DeviceName,
            port = Port,
            primary,
            addresses = addrs.Select(a => new { address = a.Address, iface = a.InterfaceName, wifi = a.IsWifi }),
            pairUri = Pair(primary).ToUri(),
            panelUrl = $"http://127.0.0.1:{Port}/?mode=desktop",
            dockUrl = $"http://127.0.0.1:{Port}/?mode=dock",
            obs = Obs.Status(),
            obsCanLaunch = _platform.CanLaunchObs,
            obsHasPassword = !string.IsNullOrEmpty(Settings.ObsPassword),
            pluginBundled = _o.PluginSource != null && Directory.Exists(_o.PluginSource),
            scriptBundled = _o.ScriptSource != null && File.Exists(_o.ScriptSource),
            webcam = WebcamObject(),
            clients = Helper.Clients,
            deckSaved = Deck.UpdatedAt?.ToUnixTimeMilliseconds(),
            firewall = SafeFirewall(),
            settings = new
            {
                deviceName = Settings.DeviceName,
                hubPort = Settings.HubPort,
                webcamPort = Settings.WebcamPort,
                obsSrtPort = Settings.ObsSrtPort,
                obsWebSocketPort = Settings.ObsWebSocketPort,
                startWithWindows = SafeAutostart(),
            },
        };
    }

    private bool SafeFirewall()
    {
        try { return _platform.FirewallConfigured(Settings); }
        catch { return false; }
    }

    private bool SafeAutostart()
    {
        try { return _platform.Autostart; }
        catch { return false; }
    }

    public async ValueTask DisposeAsync()
    {
        if (_beacon != null) await _beacon.DisposeAsync();
        await Webcam.DisposeAsync();
        if (_app != null)
        {
            await Helper.DisconnectAllAsync("StudioHub kapanıyor");
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            await _app.StopAsync(cts.Token);
            await _app.DisposeAsync();
        }
    }
}

public sealed record ObsSetupBody(bool WebSocket = true, bool Dock = true, bool Plugin = true, bool Script = true);
public sealed record DriverBody(bool Install = true);
public sealed record OpenBody(string Url);
public sealed record SettingsBody(
    string? DeviceName,
    int? HubPort,
    int? WebcamPort,
    int? ObsSrtPort,
    int? ObsWebSocketPort,
    string? ObsPassword,
    bool? StartWithWindows);
