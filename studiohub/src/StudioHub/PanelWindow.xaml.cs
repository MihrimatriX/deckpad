using System.IO;
using System.Text.Json;
using System.Windows;

namespace StudioHub;

/// <summary>DeckPad'in masaüstü sürümü: aynı tuş düzeni bilgisayar penceresinde.</summary>
public partial class PanelWindow : Window
{
    public sealed record Placement(double Left, double Top, double Width, double Height, bool Topmost);

    private static string PlacementPath => Path.Combine(App.DataDir, "panel-window.json");

    public PanelWindow(string url)
    {
        InitializeComponent();
        var p = LoadPlacement();
        if (p.Width > 0 && IsOnScreen(p))
        {
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = p.Left;
            Top = p.Top;
            Width = p.Width;
            Height = p.Height;
        }
        else WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Topmost = p.Topmost;
        SourceInitialized += (_, _) => WebShell.DarkTitleBar(this);
        Loaded += async (_, _) =>
        {
            if (!await WebShell.InitAsync(Web, url))
            {
                Web.Visibility = Visibility.Collapsed;
                Fallback.Visibility = Visibility.Visible;
            }
        };
        Closing += (_, _) => SavePlacement();
    }

    private static bool IsOnScreen(Placement p) =>
        p.Left + 80 < SystemParameters.VirtualScreenLeft + SystemParameters.VirtualScreenWidth &&
        p.Top + 40 < SystemParameters.VirtualScreenTop + SystemParameters.VirtualScreenHeight &&
        p.Left + p.Width > SystemParameters.VirtualScreenLeft + 80 &&
        p.Top > SystemParameters.VirtualScreenTop - 10;

    public static Placement LoadPlacement()
    {
        try
        {
            if (File.Exists(PlacementPath))
                return JsonSerializer.Deserialize<Placement>(File.ReadAllText(PlacementPath)) ?? new(0, 0, 0, 0, false);
        }
        catch
        {
        }
        return new(0, 0, 0, 0, false);
    }

    private void SavePlacement()
    {
        try
        {
            var r = WindowState == WindowState.Normal ? new Rect(Left, Top, Width, Height) : RestoreBounds;
            File.WriteAllText(PlacementPath, JsonSerializer.Serialize(new Placement(r.Left, r.Top, r.Width, r.Height, Topmost)));
        }
        catch
        {
        }
    }
}
