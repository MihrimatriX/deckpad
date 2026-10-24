using System.Globalization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using StudioHub.Core;
using StudioHub.Core.Webcam;

namespace StudioHub.Platform;

/// <summary>
/// Telefon görüntüsü yokken sanal kamerada görünen kare. Zoom ya da Discord'da sürücünün
/// renkli hata deseni yerine ne yapılması gerektiğini söyleyen sakin bir ekran çıkar.
/// </summary>
public sealed class IdleFrames
{
    private readonly Dictionary<string, byte[]> _cache = [];
    private readonly FontFamily _display;
    private readonly FontFamily _body;

    public IdleFrames()
    {
        var baseUri = new Uri("pack://application:,,,/");
        _display = new FontFamily(baseUri, "./Assets/#Barlow Semi Condensed");
        // Statik yazı tipinde aile adı "Barlow SemiBold", tipografik aile adı "Barlow"dur; ikisi de denenir.
        _body = new FontFamily(baseUri, "./Assets/#Barlow SemiBold, ./Assets/#Barlow");
    }

    public byte[]? Get(WebcamSettings s, WebcamState state, string? error)
    {
        var (title, line) = state switch
        {
            WebcamState.Stopped => ("Kamera kapalı", "StudioHub'da OBS'siz webcam alıcısını başlat."),
            WebcamState.Error => ("Kamera başlatılamadı", error ?? "Ayrıntılar StudioHub penceresinde."),
            _ => ("Telefon bekleniyor", "CamLink'te hedef olarak bu bilgisayarı seç ve yayını başlat."),
        };
        var key = $"{s.Width}x{s.Height}|{title}|{line}";
        lock (_cache)
        {
            if (_cache.TryGetValue(key, out var hit)) return hit;
        }
        byte[]? frame = null;
        // WPF çizimi kendi iş parçacığını ister; arka planda STA iş parçacığında çizilir.
        var t = new Thread(() => frame = Render(s.Width, s.Height, title, line));
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();
        if (frame != null)
        {
            lock (_cache) _cache[key] = frame;
        }
        return frame;
    }

    private byte[] Render(int w, int h, string title, string line)
    {
        var k = h / 720.0;
        var dv = new DrawingVisual();
        using (var dc = dv.RenderOpen())
        {
            var bg = new LinearGradientBrush(Color.FromRgb(0x13, 0x22, 0x4A), Color.FromRgb(0x08, 0x11, 0x2A), 90);
            dc.DrawRectangle(bg, null, new Rect(0, 0, w, h));

            // Ortada kamera simgesi: yuvaya oturmuş tuş ve mercek halkası
            var cx = w / 2.0;
            var cy = h * 0.40;
            dc.DrawRoundedRectangle(new SolidColorBrush(Color.FromRgb(0x05, 0x0C, 0x1F)), null, new Rect(cx - 74 * k, cy - 74 * k, 148 * k, 148 * k), 30 * k, 30 * k);
            dc.DrawRoundedRectangle(new SolidColorBrush(Color.FromRgb(0x0E, 0x26, 0x68)), null, new Rect(cx - 64 * k, cy - 60 * k, 128 * k, 126 * k), 24 * k, 24 * k);
            var face = new LinearGradientBrush(Color.FromRgb(0x3A, 0x6E, 0xEB), Color.FromRgb(0x1C, 0x46, 0xB3), 90);
            dc.DrawRoundedRectangle(face, null, new Rect(cx - 64 * k, cy - 64 * k, 128 * k, 118 * k), 24 * k, 24 * k);
            dc.DrawRoundedRectangle(new SolidColorBrush(Color.FromRgb(0x8C, 0xE4, 0xFF)), null, new Rect(cx - 28 * k, cy - 52 * k, 56 * k, 8 * k), 4 * k, 4 * k);
            dc.DrawEllipse(null, new Pen(Brushes.White, 9 * k), new Point(cx, cy + 2 * k), 25 * k, 25 * k);
            dc.DrawEllipse(Brushes.White, null, new Point(cx, cy + 2 * k), 8 * k, 8 * k);

            var dpi = 1.0;
            var t = new FormattedText(title, CultureInfo.GetCultureInfo("tr-TR"), FlowDirection.LeftToRight,
                new Typeface(_display, FontStyles.Normal, FontWeights.Bold, FontStretches.Normal), 52 * k,
                new SolidColorBrush(Color.FromRgb(0xDC, 0xE7, 0xFF)), dpi);
            dc.DrawText(t, new Point(cx - t.Width / 2, h * 0.60));
            var l = new FormattedText(line, CultureInfo.GetCultureInfo("tr-TR"), FlowDirection.LeftToRight,
                new Typeface(_body, FontStyles.Normal, FontWeights.Normal, FontStretches.Normal), 26 * k,
                new SolidColorBrush(Color.FromRgb(0x7F, 0x93, 0xBD)), dpi)
            {
                MaxTextWidth = w * 0.8,
                TextAlignment = TextAlignment.Center,
            };
            dc.DrawText(l, new Point(cx - w * 0.4, h * 0.60 + t.Height + 14 * k));
        }
        var bmp = new RenderTargetBitmap(w, h, 96, 96, PixelFormats.Pbgra32);
        bmp.Render(dv);
        var bgra = new byte[w * h * 4];
        bmp.CopyPixels(bgra, w * 4, 0);
        // BGRA -> RGBA (görüntü opak olduğu için ön çarpım farkı yok)
        for (var i = 0; i < bgra.Length; i += 4) (bgra[i], bgra[i + 2]) = (bgra[i + 2], bgra[i]);
        return bgra;
    }
}
