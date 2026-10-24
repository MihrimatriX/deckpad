using System.Diagnostics;

namespace StudioHub.Core.Webcam;

/// <summary>Çözülmüş kareleri sanal kameraya (Windows'ta Unity Capture sürücüsü) yazan hedef.</summary>
public interface IFrameSink : IDisposable
{
    /// <summary>Sanal kamera sürücüsü sisteme kayıtlı mı.</summary>
    bool IsInstalled { get; }

    /// <summary>Şu an bir uygulama (Zoom, Discord...) kamerayı okuyor mu.</summary>
    bool HasConsumer { get; }

    /// <summary>Sanal kameranın uygulamalarda görünen adı.</summary>
    string DeviceName { get; }

    /// <summary>RGBA, satır aralığı = genişlik × 4.</summary>
    void Write(ReadOnlySpan<byte> rgba, int width, int height);
}

public enum WebcamState { Stopped, Waiting, Receiving, Error }

/// <summary>
/// CamLink'ten gelen SRT yayınını FFmpeg ile çözer ve kareleri sanal kameraya aktarır.
/// Telefon bağlantıyı kesince FFmpeg kapanır; servis onu yeniden dinlemeye başlatır.
/// </summary>
public sealed class WebcamService : IAsyncDisposable
{
    private readonly string _ffmpeg;
    private readonly IFrameSink _sink;
    private readonly Func<WebcamSettings> _settings;
    private readonly Func<int> _port;
    private readonly object _previewLock = new();
    private CancellationTokenSource? _cts;
    private Task? _loop;
    private Process? _proc;
    private byte[]? _preview;
    private int _previewW, _previewH;
    private readonly Queue<string> _log = new();

    public WebcamService(string ffmpegPath, IFrameSink sink, Func<WebcamSettings> settings, Func<int> port)
    {
        _ffmpeg = ffmpegPath;
        _sink = sink;
        _settings = settings;
        _port = port;
    }

    public WebcamState State { get; private set; } = WebcamState.Stopped;
    public string? LastError { get; private set; }
    public long Frames { get; private set; }
    public double Fps { get; private set; }
    public DateTimeOffset? ReceivingSince { get; private set; }
    public string? Sender { get; private set; }
    public bool FfmpegFound => File.Exists(_ffmpeg);
    public IFrameSink Sink => _sink;

    /// <summary>Windows kabuğu FFmpeg'i bir iş nesnesine bağlar; uygulama çökerse FFmpeg de kapanır.</summary>
    public Action<Process>? ProcessStarted { get; set; }

    /// <summary>
    /// Telefon görüntüsü yokken sanal kamerada gösterilecek kare (RGBA, ayarlardaki boyutta, yukarıdan aşağı).
    /// Verilmezse sürücü kendi "görüntü yok" desenini gösterir.
    /// </summary>
    public Func<WebcamSettings, WebcamState, string?, byte[]?>? IdleFrame { get; set; }

    private readonly object _sinkLock = new();
    private CancellationTokenSource? _idleCts;

    /// <summary>Uygulama açık olduğu sürece, görüntü gelmiyorsa sanal kameraya bekleme karesi yollar.</summary>
    public void StartIdleFrames()
    {
        if (_idleCts != null) return;
        _idleCts = new CancellationTokenSource();
        var ct = _idleCts.Token;
        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    if (State != WebcamState.Receiving && IdleFrame != null && _sink.IsInstalled)
                    {
                        var s = _settings();
                        var frame = IdleFrame(s, State, LastError);
                        if (frame != null && frame.Length == s.Width * s.Height * 4)
                        {
                            var data = s.FlipVertical ? FlipRows(frame, s.Width, s.Height) : frame;
                            lock (_sinkLock)
                            {
                                if (State != WebcamState.Receiving) _sink.Write(data, s.Width, s.Height);
                            }
                        }
                    }
                }
                catch
                {
                    // Bekleme karesi süs; hatası alıcıyı etkilememeli.
                }
                try { await Task.Delay(250, ct); }
                catch (OperationCanceledException) { break; }
            }
        }, ct);
    }

    private byte[]? _flipCache;
    private byte[]? _flipSource;

    internal byte[] FlipRows(byte[] src, int w, int h)
    {
        if (ReferenceEquals(src, _flipSource) && _flipCache != null) return _flipCache;
        var dst = new byte[src.Length];
        var row = w * 4;
        for (var y = 0; y < h; y++) Buffer.BlockCopy(src, y * row, dst, (h - 1 - y) * row, row);
        _flipSource = src;
        _flipCache = dst;
        return dst;
    }

    public void Start()
    {
        if (_loop != null) return;
        if (!FfmpegFound)
        {
            State = WebcamState.Error;
            LastError = "FFmpeg bulunamadı. Uygulamayı zip'teki klasör yapısıyla birlikte çalıştır.";
            return;
        }
        _cts = new CancellationTokenSource();
        _loop = Task.Run(() => RunAsync(_cts.Token));
    }

    public async Task StopAsync()
    {
        var cts = _cts;
        if (cts == null) return;
        cts.Cancel();
        KillProc();
        if (_loop != null)
        {
            try { await _loop; } catch { }
        }
        cts.Dispose();
        _cts = null;
        _loop = null;
        State = WebcamState.Stopped;
        ReceivingSince = null;
        Fps = 0;
    }

    /// <summary>Ayar değişince FFmpeg'i yeni boyutlarla baştan başlatır.</summary>
    public async Task RestartAsync()
    {
        await StopAsync();
        Start();
    }

    public static List<string> BuildArgs(WebcamSettings s, int port)
    {
        var w = s.Width;
        var h = s.Height;
        var filters = new List<string>
        {
            $"scale={w}:{h}:force_original_aspect_ratio=decrease",
            $"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black",
            $"fps={s.Fps}",
        };
        if (s.Mirror) filters.Add("hflip");
        if (s.FlipVertical) filters.Add("vflip");
        return
        [
            "-hide_banner", "-loglevel", "error", "-nostdin",
            "-fflags", "nobuffer", "-flags", "low_delay",
            "-probesize", "1000000", "-analyzeduration", "1000000",
            // SRT gecikmesi FFmpeg'de mikrosaniye cinsindendir.
            "-i", $"srt://0.0.0.0:{port}?mode=listener&latency=120000",
            "-an",
            "-vf", string.Join(",", filters),
            "-pix_fmt", "rgba",
            "-f", "rawvideo",
            "pipe:1",
        ];
    }

    private async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var s = _settings();
            var w = s.Width;
            var h = s.Height;
            var frameSize = w * h * 4;
            var buf = new byte[frameSize];
            var psi = new ProcessStartInfo(_ffmpeg)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            foreach (var a in BuildArgs(s, _port())) psi.ArgumentList.Add(a);

            try
            {
                _proc = Process.Start(psi) ?? throw new InvalidOperationException("FFmpeg başlatılamadı");
            }
            catch (Exception e)
            {
                State = WebcamState.Error;
                LastError = e.Message;
                await Delay(3000, ct);
                continue;
            }

            State = WebcamState.Waiting;
            ReceivingSince = null;
            Sender = null;
            var proc = _proc;
            try { ProcessStarted?.Invoke(proc); }
            catch { }
            _ = Task.Run(() => PumpErrors(proc), CancellationToken.None);

            var stdout = proc.StandardOutput.BaseStream;
            var sw = Stopwatch.StartNew();
            var windowFrames = 0;
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    await stdout.ReadExactlyAsync(buf, ct);
                    if (State != WebcamState.Receiving)
                    {
                        State = WebcamState.Receiving;
                        ReceivingSince = DateTimeOffset.Now;
                        LastError = null;
                        // Kare hızı ilk kareden itibaren ölçülür; bekleme süresi hesaba girmez.
                        sw.Restart();
                        windowFrames = 0;
                    }
                    Frames++;
                    windowFrames++;
                    try
                    {
                        lock (_sinkLock) _sink.Write(buf, w, h);
                    }
                    catch (Exception e)
                    {
                        LastError = "Sanal kameraya yazılamadı: " + e.Message;
                    }
                    if (Frames % 10 == 0) KeepPreview(buf, w, h, s.FlipVertical);
                    if (sw.ElapsedMilliseconds >= 1000)
                    {
                        Fps = Math.Round(windowFrames * 1000.0 / sw.ElapsedMilliseconds, 1);
                        windowFrames = 0;
                        sw.Restart();
                    }
                }
            }
            catch (EndOfStreamException)
            {
                // Telefon yayını durdurdu; dinlemeye dön.
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (IOException)
            {
            }
            finally
            {
                KillProc();
                Fps = 0;
                ReceivingSince = null;
            }
            if (!ct.IsCancellationRequested) State = WebcamState.Waiting;
            await Delay(400, ct);
        }
    }

    private void PumpErrors(Process p)
    {
        try
        {
            string? line;
            while ((line = p.StandardError.ReadLine()) != null)
            {
                lock (_log)
                {
                    _log.Enqueue(line);
                    while (_log.Count > 20) _log.Dequeue();
                }
                if (line.Contains("Address already in use", StringComparison.OrdinalIgnoreCase) || line.Contains("bind", StringComparison.OrdinalIgnoreCase))
                    LastError = $"Port {_port()} kullanımda. Ayarlardan başka bir port seç.";
            }
        }
        catch
        {
        }
    }

    public IReadOnlyList<string> RecentLog()
    {
        lock (_log) return _log.ToList();
    }

    private void KillProc()
    {
        var p = _proc;
        _proc = null;
        if (p == null) return;
        try
        {
            if (!p.HasExited) p.Kill(entireProcessTree: true);
        }
        catch
        {
        }
        p.Dispose();
    }

    private static async Task Delay(int ms, CancellationToken ct)
    {
        try { await Task.Delay(ms, ct); }
        catch (OperationCanceledException) { }
    }

    /// <summary>Önizleme için kareyi 320 piksel genişliğe küçültüp saklar.</summary>
    private void KeepPreview(byte[] rgba, int w, int h, bool flippedForDirectShow)
    {
        const int pw = 320;
        var ph = Math.Max(1, h * pw / w);
        var outBuf = new byte[pw * ph * 3];
        for (var y = 0; y < ph; y++)
        {
            // Kare DirectShow için alttan üste çevrildiyse önizleme için düzelt.
            var sy = y * h / ph;
            if (flippedForDirectShow) sy = h - 1 - sy;
            for (var x = 0; x < pw; x++)
            {
                var sx = x * w / pw;
                var si = (sy * w + sx) * 4;
                var di = (y * pw + x) * 3;
                outBuf[di] = rgba[si];
                outBuf[di + 1] = rgba[si + 1];
                outBuf[di + 2] = rgba[si + 2];
            }
        }
        lock (_previewLock)
        {
            _preview = outBuf;
            _previewW = pw;
            _previewH = ph;
        }
    }

    /// <summary>Son karenin küçük önizlemesini BMP olarak döner (yoksa null).</summary>
    public byte[]? PreviewBmp()
    {
        lock (_previewLock)
        {
            return _preview == null ? null : Bmp.FromRgb(_preview, _previewW, _previewH);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _idleCts?.Cancel();
        await StopAsync();
        _sink.Dispose();
    }
}

/// <summary>Bağımlılıksız küçük BMP yazıcı (24 bit, yukarıdan aşağı).</summary>
public static class Bmp
{
    public static byte[] FromRgb(byte[] rgb, int w, int h)
    {
        var rowSize = (w * 3 + 3) & ~3;
        var dataSize = rowSize * h;
        var bmp = new byte[54 + dataSize];
        void W16(int o, int v) { bmp[o] = (byte)v; bmp[o + 1] = (byte)(v >> 8); }
        void W32(int o, int v) { W16(o, v); W16(o + 2, v >> 16); }
        bmp[0] = (byte)'B';
        bmp[1] = (byte)'M';
        W32(2, bmp.Length);
        W32(10, 54);
        W32(14, 40);
        W32(18, w);
        W32(22, -h); // negatif yükseklik: satırlar yukarıdan aşağı
        W16(26, 1);
        W16(28, 24);
        W32(34, dataSize);
        for (var y = 0; y < h; y++)
        {
            var o = 54 + y * rowSize;
            for (var x = 0; x < w; x++)
            {
                var s = (y * w + x) * 3;
                bmp[o + x * 3] = rgb[s + 2];
                bmp[o + x * 3 + 1] = rgb[s + 1];
                bmp[o + x * 3 + 2] = rgb[s];
            }
        }
        return bmp;
    }
}
