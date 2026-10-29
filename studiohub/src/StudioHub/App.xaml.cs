using System.Diagnostics;
using System.IO;
using System.Windows;
using StudioHub.Core;
using StudioHub.Core.Obs;
using StudioHub.Core.Server;
using StudioHub.Platform;

namespace StudioHub;

public partial class App : Application
{
    private const string MutexName = "StudioHub.TekKopya";
    private const string ShowEventName = "StudioHub.Goster";

    private Mutex? _single;
    private EventWaitHandle? _showEvent;
    private HubHost? _host;
    private Tray? _tray;
    private MainWindow? _main;
    private PanelWindow? _panel;

    public static string DataDir { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "StudioHub");

    /// <summary>Exe'ye gömülü yönetim arayüzü, DeckPad paneli ve OBS betiğinin çıkarıldığı klasör.</summary>
    public static string WebDir { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StudioHub", "web");

    public HubHost Host => _host!;

    /// <summary>
    /// StudioHub tek exe olarak dağıtılır ve İndirilenler gibi herhangi bir klasörden çalışır; yanına dosya
    /// yazılmaz. Gömülü dosyalar (csproj'da "web/" önekli EmbeddedResource) <see cref="WebDir"/>'e çıkarılır.
    /// Exe değişmedikçe yeniden yazılmaz; değişince klasör baştan kurulur (eski panel dosyaları birikmez).
    /// </summary>
    private static void ExtractWebContent()
    {
        const string prefix = "web/";
        var asm = typeof(App).Assembly;
        // Deterministik derlemede MVID, gömülü dosyalar dahil derlemenin içeriğinden üretilir.
        var stamp = asm.ManifestModule.ModuleVersionId.ToString();
        var stampFile = Path.Combine(WebDir, ".surum");
        if (File.Exists(stampFile) && File.ReadAllText(stampFile) == stamp) return;

        try { if (Directory.Exists(WebDir)) Directory.Delete(WebDir, recursive: true); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { Log("Eski arayüz klasörü silinemedi: " + e.Message); }
        foreach (var name in asm.GetManifestResourceNames())
        {
            if (!name.StartsWith(prefix, StringComparison.Ordinal)) continue;
            // Alt klasörler MSBuild'in RecursiveDir'inden ters eğik çizgiyle gelir.
            var target = Path.Combine(WebDir, name[prefix.Length..].Replace('\\', '/'));
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            using var src = asm.GetManifestResourceStream(name)!;
            using var dst = File.Create(target);
            src.CopyTo(dst);
        }
        // Damga en son yazılır: yarıda kalan çıkarma bir sonraki açılışta baştan yapılır.
        File.WriteAllText(stampFile, stamp);
    }

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Yönetici olarak açılan yardımcı süreç: işini yapıp kapanır.
        if (e.Args.Length >= 3 && e.Args[0] == "--elevated")
        {
            Shutdown(Elevated.Run(e.Args[1], e.Args[2]));
            return;
        }

        _single = new Mutex(true, MutexName, out var first);
        if (!first)
        {
            // Zaten açıksa var olan pencereyi öne getir.
            try { EventWaitHandle.OpenExisting(ShowEventName).Set(); } catch { }
            Shutdown();
            return;
        }
        _showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
        new Thread(() =>
        {
            while (_showEvent.WaitOne()) Dispatcher.Invoke(ShowMain);
        }) { IsBackground = true }.Start();

        DispatcherUnhandledException += (_, ex) =>
        {
            Log("Beklenmeyen hata: " + ex.Exception);
            ex.Handled = true;
        };

        Directory.CreateDirectory(DataDir);
        try
        {
            ExtractWebContent();
        }
        catch (Exception ex)
        {
            Log("Arayüz dosyaları çıkarılamadı: " + ex);
            MessageBox.Show($"Arayüz dosyaları {WebDir} klasörüne yazılamadı.\n\n{ex.Message}", "StudioHub başlatılamadı", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
            return;
        }
        var platform = new WindowsPlatform(() => Dispatcher.Invoke(ShowPanel));
        var obs = ObsConfigurator.ForCurrentUser(platform.IsObsRunning);
        // "OBS'i hazırla" betiği OBS'in kendi betik klasörüne kopyalar; OBS bu klasöre bağlı kalmaz.
        var script = Path.Combine(WebDir, "obs", "deckpad.lua");

        _host = new HubHost(new HubOptions
        {
            SettingsPath = Path.Combine(DataDir, "settings.json"),
            DeckPath = Path.Combine(DataDir, "deck.json"),
            PanelRoot = Path.Combine(WebDir, "panel"),
            AdminRoot = Path.Combine(WebDir, "hub"),
            ContentRoot = WebDir,
            ScriptSource = File.Exists(script) ? script : null,
        }, platform, new WindowsPc(), obs);

        try
        {
            await _host.StartAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show(_host.StartError ?? ex.Message, "StudioHub başlatılamadı", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
            return;
        }

        _tray = new Tray(this);
        _host.StatusChanged += () => Dispatcher.BeginInvoke(() => _tray?.Update());
        _tray.Update();

        if (!e.Args.Contains("--minimized")) ShowMain();
    }

    public void ShowMain()
    {
        if (_main == null)
        {
            _main = new MainWindow(_host!.BaseUrl + "/hub/");
            _main.Closed += (_, _) => _main = null;
        }
        _main.Show();
        if (_main.WindowState == WindowState.Minimized) _main.WindowState = WindowState.Normal;
        _main.Activate();
    }

    public void ShowPanel()
    {
        if (_panel == null)
        {
            _panel = new PanelWindow(_host!.BaseUrl + "/?mode=desktop");
            _panel.Closed += (_, _) => _panel = null;
        }
        _panel.Show();
        if (_panel.WindowState == WindowState.Minimized) _panel.WindowState = WindowState.Normal;
        _panel.Activate();
    }

    public bool PanelTopmost
    {
        get => _panel?.Topmost ?? PanelWindow.LoadPlacement().Topmost;
        set
        {
            ShowPanel();
            _panel!.Topmost = value;
        }
    }

    public bool IsQuitting { get; private set; }

    public void Hint(string title, string text) => _tray?.Balloon(title, text);

    public async void Quit()
    {
        IsQuitting = true;
        _tray?.Dispose();
        _tray = null;
        _main?.Close();
        _panel?.Close();
        if (_host != null)
        {
            try { await _host.DisposeAsync(); }
            catch (Exception ex) { Log("Kapanış: " + ex.Message); }
        }
        _single?.ReleaseMutex();
        Shutdown();
    }

    public static void Log(string line)
    {
        try
        {
            Directory.CreateDirectory(DataDir);
            File.AppendAllText(Path.Combine(DataDir, "studiohub.log"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {line}{Environment.NewLine}");
        }
        catch
        {
        }
        Debug.WriteLine(line);
    }
}
