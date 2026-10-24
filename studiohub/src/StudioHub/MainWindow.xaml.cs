using System.ComponentModel;
using System.Diagnostics;
using System.Windows;

namespace StudioHub;

public partial class MainWindow : Window
{
    private readonly string _url;
    private static bool _hintShown;

    public MainWindow(string url)
    {
        _url = url;
        InitializeComponent();
        SourceInitialized += (_, _) => WebShell.DarkTitleBar(this);
        Loaded += async (_, _) =>
        {
            if (!await WebShell.InitAsync(Web, _url))
            {
                Web.Visibility = Visibility.Collapsed;
                Fallback.Visibility = Visibility.Visible;
            }
        };
    }

    // Pencereyi kapatmak uygulamayı kapatmaz; telefonlar bağlı kalsın diye tepside çalışmaya devam eder.
    protected override void OnClosing(CancelEventArgs e)
    {
        if (Application.Current is App { IsQuitting: false })
        {
            e.Cancel = true;
            Hide();
            if (!_hintShown)
            {
                _hintShown = true;
                ((App)Application.Current).Hint("StudioHub arka planda çalışıyor", "Telefonlar bağlı kalır. Kapatmak için tepsideki simgeye sağ tıkla.");
            }
        }
        base.OnClosing(e);
    }

    private void OpenBrowser_Click(object sender, RoutedEventArgs e) =>
        Process.Start(new ProcessStartInfo(_url) { UseShellExecute = true })?.Dispose();

    private void GetRuntime_Click(object sender, RoutedEventArgs e) =>
        Process.Start(new ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/") { UseShellExecute = true })?.Dispose();
}
