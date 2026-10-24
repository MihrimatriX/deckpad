using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using StudioHub.Platform;

namespace StudioHub;

/// <summary>StudioHub pencerelerinin ortak WebView2 kurulumu.</summary>
internal static class WebShell
{
    private static Task<CoreWebView2Environment>? _env;

    private static Task<CoreWebView2Environment> Env() => _env ??= CoreWebView2Environment.CreateAsync(
        browserExecutableFolder: null,
        // Uygulama Program Files'ta olsa da yazılabilir bir klasör kullanılır.
        userDataFolder: Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StudioHub", "WebView2"));

    public static async Task<bool> InitAsync(WebView2 view, string url)
    {
        try
        {
            view.DefaultBackgroundColor = System.Drawing.Color.FromArgb(255, 0x0B, 0x15, 0x30);
            await view.EnsureCoreWebView2Async(await Env());
        }
        catch (Exception e) when (e is WebView2RuntimeNotFoundException or FileNotFoundException or DllNotFoundException)
        {
            App.Log("WebView2 bulunamadı: " + e.Message);
            return false;
        }
        var core = view.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreDevToolsEnabled = Debugger.IsAttached;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = true;
        var origin = new Uri(url).GetLeftPart(UriPartial.Authority);
        // StudioHub dışındaki adresler varsayılan tarayıcıda açılır.
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            OpenExternal(e.Uri);
        };
        core.NavigationStarting += (_, e) =>
        {
            if (!e.Uri.StartsWith(origin, StringComparison.OrdinalIgnoreCase))
            {
                e.Cancel = true;
                OpenExternal(e.Uri);
            }
        };
        view.Source = new Uri(url);
        return true;
    }

    private static void OpenExternal(string uri)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var u) && u.Scheme is "http" or "https")
            Process.Start(new ProcessStartInfo(u.ToString()) { UseShellExecute = true })?.Dispose();
    }

    /// <summary>Windows 10/11'de başlık çubuğunu koyu yapar; Windows 11'de gövde rengine boyar.</summary>
    public static void DarkTitleBar(Window w)
    {
        var hwnd = new WindowInteropHelper(w).Handle;
        var on = 1;
        Native.DwmSetWindowAttribute(hwnd, Native.DWMWA_USE_IMMERSIVE_DARK_MODE, ref on, sizeof(int));
        var color = 0x30 << 16 | 0x15 << 8 | 0x0B; // COLORREF 0x00BBGGRR, #0B1530
        Native.DwmSetWindowAttribute(hwnd, Native.DWMWA_CAPTION_COLOR, ref color, sizeof(int));
    }
}
