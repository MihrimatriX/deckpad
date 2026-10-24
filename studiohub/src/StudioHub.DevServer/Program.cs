using StudioHub.Core.Obs;
using StudioHub.Core.Server;
using StudioHub.Dev;

// Linux'ta yönetim arayüzünü ve telefon bağlantılarını denemek için StudioHub'ı sahte platformla çalıştırır.
//   dotnet run --project src/StudioHub.DevServer -- <veri klasörü> <panel klasörü> <arayüz klasörü>
var data = args.ElementAtOrDefault(0) ?? Path.Combine(Path.GetTempPath(), "studiohub-dev");
var panel = args.ElementAtOrDefault(1) ?? Path.Combine(AppContext.BaseDirectory, "panel");
var admin = args.ElementAtOrDefault(2) ?? Path.Combine(AppContext.BaseDirectory, "hub");
var bundle = args.ElementAtOrDefault(3);
Directory.CreateDirectory(data);

var sink = new FakeSink();
var platform = new FakePlatform(sink);
// Gerçek OBS ile test için yapılandırma klasörleri dışarıdan verilebilir.
var obsDir = Environment.GetEnvironmentVariable("OBS_CONFIG_DIR") ?? Path.Combine(data, "obs-studio");
var pluginRoot = Environment.GetEnvironmentVariable("OBS_PLUGIN_ROOT") ?? Path.Combine(data, "obs-plugins");
var obs = new ObsConfigurator(obsDir, pluginRoot, platform.IsObsRunning);
await using var host = new HubHost(new HubOptions
{
    SettingsPath = Path.Combine(data, "settings.json"),
    DeckPath = Path.Combine(data, "deck.json"),
    PanelRoot = panel,
    AdminRoot = admin,
    FfmpegPath = Environment.GetEnvironmentVariable("FFMPEG") ?? "/usr/local/bin/ffmpeg",
    PluginSource = bundle == null ? null : Path.Combine(bundle, "obs-plugin", "camlink"),
    ScriptSource = bundle == null ? null : Path.Combine(bundle, "obs-script", "deckpad-camlink.lua"),
    LogToConsole = true,
    IsLocal = ip => ip != null && (System.Net.IPAddress.IsLoopback(ip) || Environment.GetEnvironmentVariable("HUB_ALL_LOCAL") == "1"),
}, platform, new FakePc(), sink, obs);

await host.StartAsync();
Console.WriteLine($"StudioHub geliştirme sunucusu: {host.BaseUrl}/hub/  (veri: {data})");
var done = new TaskCompletionSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; done.TrySetResult(); };
AppDomain.CurrentDomain.ProcessExit += (_, _) => done.TrySetResult();
await done.Task;
