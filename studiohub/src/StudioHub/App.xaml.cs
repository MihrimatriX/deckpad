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
    private UnityCaptureSink? _sink;
    private readonly JobObject _job = new();

    public static string DataDir { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "StudioHub");

    public HubHost Host => _host!;

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
        var baseDir = AppContext.BaseDirectory;
        _sink = new UnityCaptureSink("CamLink Kamera");
        var platform = new WindowsPlatform(_sink, () => Dispatcher.Invoke(ShowPanel));
        var obs = ObsConfigurator.ForCurrentUser(platform.IsObsRunning);
        var plugin = Path.Combine(baseDir, "obs", "obs-plugin", "camlink");
        var script = Path.Combine(baseDir, "obs", "obs-script", "deckpad-camlink.lua");

        _host = new HubHost(new HubOptions
        {
            SettingsPath = Path.Combine(DataDir, "settings.json"),
            DeckPath = Path.Combine(DataDir, "deck.json"),
            PanelRoot = Path.Combine(baseDir, "panel"),
            AdminRoot = Path.Combine(baseDir, "hub"),
            FfmpegPath = Path.Combine(baseDir, "ffmpeg", "ffmpeg.exe"),
            PluginSource = Directory.Exists(plugin) ? plugin : null,
            ScriptSource = File.Exists(script) ? script : null,
        }, platform, new WindowsPc(), _sink, obs);

        var idle = new IdleFrames();
        _host.Webcam.IdleFrame = idle.Get;
        _host.Webcam.ProcessStarted = _job.Add;

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

    public async Task ToggleWebcamAsync()
    {
        if (_host!.Webcam.State == Core.Webcam.WebcamState.Stopped) _host.Webcam.Start();
        else await _host.Webcam.StopAsync();
        _tray?.Update();
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
