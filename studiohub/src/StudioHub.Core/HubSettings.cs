using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StudioHub.Core;

/// <summary>Kalıcı ayarlar. %APPDATA%\StudioHub\settings.json içinde tutulur.</summary>
public sealed class HubSettings
{
    /// <summary>Telefonlarda görünen bilgisayar adı.</summary>
    public string DeviceName { get; set; } = Environment.MachineName;

    /// <summary>Panel, yönetim arayüzü ve DeckPad bilgisayar eylemleri için tek HTTP/WebSocket portu.</summary>
    public int HubPort { get; set; } = 4466;

    /// <summary>CamLink'in OBS'siz webcam için yayın yaptığı SRT portu.</summary>
    public int WebcamPort { get; set; } = 9100;

    /// <summary>CamLink'in OBS'e yayın yaptığı SRT portu (OBS içindeki Medya Kaynağı dinler).</summary>
    public int ObsSrtPort { get; set; } = 9000;

    public int ObsWebSocketPort { get; set; } = 4455;

    /// <summary>OBS WebSocket şifresi. "OBS'i hazırla" ile üretilir; telefon eşleştirme koduna eklenir.</summary>
    public string? ObsPassword { get; set; }

    /// <summary>DeckPad'in bilgisayar eylemleri için kullandığı eşleştirme anahtarı.</summary>
    public string PairToken { get; set; } = NewToken();

    public bool StartWithWindows { get; set; }

    public WebcamSettings Webcam { get; set; } = new();

    public static string NewToken()
    {
        Span<byte> b = stackalloc byte[12];
        RandomNumberGenerator.Fill(b);
        return Convert.ToBase64String(b).Replace('+', 'x').Replace('/', 'y').TrimEnd('=');
    }

    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string DefaultPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "StudioHub", "settings.json");

    public static HubSettings Load(string? path = null)
    {
        path ??= DefaultPath;
        try
        {
            if (File.Exists(path))
            {
                var s = JsonSerializer.Deserialize<HubSettings>(File.ReadAllText(path), Json);
                if (s != null)
                {
                    s.Normalize();
                    return s;
                }
            }
        }
        catch (JsonException)
        {
            // Bozuk dosya: varsayılanlarla devam edilir, yenisi yazılır.
        }
        var fresh = new HubSettings();
        fresh.Save(path);
        return fresh;
    }

    public void Save(string? path = null)
    {
        path ??= DefaultPath;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(this, Json));
        File.Move(tmp, path, overwrite: true);
    }

    internal void Normalize()
    {
        HubPort = ClampPort(HubPort, 4466);
        WebcamPort = ClampPort(WebcamPort, 9100);
        ObsSrtPort = ClampPort(ObsSrtPort, 9000);
        ObsWebSocketPort = ClampPort(ObsWebSocketPort, 4455);
        if (string.IsNullOrWhiteSpace(PairToken) || PairToken.Length < 8) PairToken = NewToken();
        if (string.IsNullOrWhiteSpace(DeviceName)) DeviceName = Environment.MachineName;
        Webcam ??= new WebcamSettings();
        Webcam.Normalize();
    }

    private static int ClampPort(int p, int fallback) => p is > 1023 and < 65536 ? p : fallback;
}

public sealed class WebcamSettings
{
    public int Width { get; set; } = 1280;
    public int Height { get; set; } = 720;
    public int Fps { get; set; } = 30;

    /// <summary>DirectShow görüntüsü alttan üste okur; sanal kamerada görüntü ters çıkarsa kapatılır.</summary>
    public bool FlipVertical { get; set; } = true;

    public bool Mirror { get; set; }

    /// <summary>Uygulama açılınca alıcıyı başlat.</summary>
    public bool AutoStart { get; set; } = true;

    internal void Normalize()
    {
        (Width, Height) = (Width, Height) switch
        {
            (1920, 1080) => (1920, 1080),
            (640, 360) => (640, 360),
            _ => (1280, 720),
        };
        Fps = Fps is 60 ? 60 : 30;
    }
}
