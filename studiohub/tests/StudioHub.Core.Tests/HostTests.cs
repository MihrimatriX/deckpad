using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using StudioHub.Core;
using StudioHub.Core.Obs;
using StudioHub.Core.Server;
using StudioHub.Core.Webcam;
using StudioHub.Dev;

namespace StudioHub.Core.Tests;

public sealed class HostFixture : IAsyncLifetime
{
    public readonly string Dir = Directory.CreateTempSubdirectory("hub-test").FullName;
    public readonly FakePc Pc = new();
    public readonly FakeSink Sink = new();
    public FakePlatform Platform = null!;
    public HubHost Host = null!;
    public HttpClient Http = null!;
    public int Port;

    public static int FreeTcpPort()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var p = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return p;
    }

    public async Task InitializeAsync()
    {
        Port = FreeTcpPort();
        var settings = new HubSettings { HubPort = Port, PairToken = "test-token-123", DeviceName = "Test PC" };
        settings.Webcam.AutoStart = false;
        settings.Save(Path.Combine(Dir, "settings.json"));
        var panel = Path.Combine(Dir, "panel");
        var admin = Path.Combine(Dir, "admin");
        Directory.CreateDirectory(panel);
        Directory.CreateDirectory(admin);
        File.WriteAllText(Path.Combine(panel, "index.html"), "<html>panel</html>");
        File.WriteAllText(Path.Combine(panel, "app.js"), "console.log(1)");
        File.WriteAllText(Path.Combine(admin, "index.html"), "<html>hub</html>");
        Platform = new FakePlatform(Sink);
        Host = new HubHost(new HubOptions
        {
            SettingsPath = Path.Combine(Dir, "settings.json"),
            DeckPath = Path.Combine(Dir, "deck.json"),
            PanelRoot = panel,
            AdminRoot = admin,
            FfmpegPath = "/nonexistent/ffmpeg",
        }, Platform, Pc, Sink, new ObsConfigurator(Path.Combine(Dir, "obs"), Path.Combine(Dir, "plugins"), () => false));
        await Host.StartAsync();
        Http = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{Port}") };
    }

    public async Task DisposeAsync()
    {
        Http.Dispose();
        await Host.DisposeAsync();
    }

    public async Task<ClientWebSocket> Connect()
    {
        var ws = new ClientWebSocket();
        await ws.ConnectAsync(new Uri($"ws://127.0.0.1:{Port}/ws"), CancellationToken.None);
        return ws;
    }
}

public class HostTests(HostFixture f) : IClassFixture<HostFixture>
{
    private static async Task Send(ClientWebSocket ws, object msg) =>
        await ws.SendAsync(Encoding.UTF8.GetBytes(System.Text.Json.JsonSerializer.Serialize(msg)), WebSocketMessageType.Text, true, CancellationToken.None);

    private static async Task<JsonObject?> Receive(ClientWebSocket ws, int timeoutMs = 3000)
    {
        using var cts = new CancellationTokenSource(timeoutMs);
        var buf = new byte[64 * 1024];
        var r = await ws.ReceiveAsync(buf, cts.Token);
        if (r.MessageType == WebSocketMessageType.Close) return null;
        return JsonNode.Parse(buf.AsSpan(0, r.Count)) as JsonObject;
    }

    private HttpRequestMessage Api(HttpMethod m, string path, object? body = null)
    {
        var req = new HttpRequestMessage(m, path);
        req.Headers.Add(HubHost.ApiHeader, "1");
        if (body != null) req.Content = JsonContent.Create(body);
        return req;
    }

    [Fact]
    public async Task ServesPanelAndAdmin()
    {
        Assert.Equal("<html>panel</html>", await f.Http.GetStringAsync("/"));
        Assert.Equal("<html>panel</html>", await f.Http.GetStringAsync("/some/route"));
        Assert.Equal("console.log(1)", await f.Http.GetStringAsync("/app.js"));
        Assert.Equal("<html>hub</html>", await f.Http.GetStringAsync("/hub/"));
    }

    [Fact]
    public async Task ApiNeedsHeader()
    {
        var r = await f.Http.GetAsync("/api/status");
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        r = await f.Http.SendAsync(Api(HttpMethod.Get, "/api/status"));
        r.EnsureSuccessStatusCode();
        var o = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
        Assert.Equal("Test PC", o["name"]!.GetValue<string>());
        Assert.StartsWith("studiohub://pair?", o["pairUri"]!.GetValue<string>());
        Assert.Equal("stopped", o["webcam"]!["state"]!.GetValue<string>());
    }

    [Fact]
    public async Task RejectsForeignHostHeader()
    {
        var req = new HttpRequestMessage(HttpMethod.Get, "/panel-config.json");
        req.Headers.Host = "evil.example.com";
        var r = await f.Http.SendAsync(req);
        Assert.Equal((HttpStatusCode)421, r.StatusCode);
    }

    [Fact]
    public async Task PanelConfigHasConnectionInfo()
    {
        var o = JsonNode.Parse(await f.Http.GetStringAsync("/panel-config.json"))!;
        Assert.Equal("test-token-123", o["hub"]!["token"]!.GetValue<string>());
        Assert.Equal("hub", o["storage"]!.GetValue<string>());
    }

    [Fact]
    public async Task QrIsSvg()
    {
        var r = await f.Http.SendAsync(Api(HttpMethod.Get, "/api/qr.svg"));
        Assert.Equal("image/svg+xml", r.Content.Headers.ContentType!.MediaType);
        Assert.Contains("<svg", await r.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task WrongTokenIsRejected()
    {
        using var ws = await f.Connect();
        await Send(ws, new { t = "hello", token = "yanlis", name = "Telefon" });
        var m = await Receive(ws);
        Assert.Equal("auth", m!["code"]!.GetValue<string>());
        Assert.Null(await Receive(ws));
        Assert.Equal(4001, (int)ws.CloseStatus!);
    }

    [Fact]
    public async Task RunsPcActions()
    {
        using var ws = await f.Connect();
        await Send(ws, new { t = "hello", token = "test-token-123", name = "Pixel 8", app = "deckpad" });
        var w = await Receive(ws);
        Assert.Equal("welcome", w!["t"]!.GetValue<string>());
        Assert.Equal("Test PC", w["name"]!.GetValue<string>());

        await Send(ws, new { t = "run", id = 7, action = new { op = "keys", keys = "Ctrl+Alt+K" } });
        var r = await Receive(ws);
        Assert.Equal(7, r!["id"]!.GetValue<int>());
        Assert.True(r["ok"]!.GetValue<bool>());
        Assert.Contains(f.Pc.Calls, c => c.StartsWith("keys Ctrl+Alt+K"));

        await Send(ws, new { t = "run", id = 8, action = new { op = "volume", mode = "set", value = 30 } });
        r = await Receive(ws);
        Assert.Equal(30, r!["data"]!["level"]!.GetValue<int>());

        var clients = JsonNode.Parse(await (await f.Http.SendAsync(Api(HttpMethod.Get, "/api/status"))).Content.ReadAsStringAsync())!["clients"]!.AsArray();
        Assert.Contains(clients, c => c!["name"]!.GetValue<string>() == "Pixel 8");
    }

    [Fact]
    public async Task DeckSyncNotifiesOthers()
    {
        using var a = await f.Connect();
        using var b = await f.Connect();
        foreach (var ws in new[] { a, b })
        {
            await Send(ws, new { t = "hello", token = "test-token-123", name = "x" });
            await Receive(ws);
        }
        var deck = new { version = 1, name = "Deneme", pages = new[] { new { id = "p1", name = "Ana", buttons = Array.Empty<object>() } } };
        await Send(a, new { t = "deckPut", id = 1, deck });
        var saved = await Receive(a);
        Assert.True(saved!["ok"]!.GetValue<bool>());
        var note = await Receive(b);
        Assert.Equal("deckChanged", note!["t"]!.GetValue<string>());

        await Send(b, new { t = "deckGet", id = 2 });
        var got = await Receive(b);
        Assert.Equal("Deneme", got!["deck"]!["name"]!.GetValue<string>());

        var api = JsonNode.Parse(await (await f.Http.SendAsync(Api(HttpMethod.Get, "/api/deck"))).Content.ReadAsStringAsync())!;
        Assert.Equal("Ana", api["deck"]!["pages"]![0]!["name"]!.GetValue<string>());

        await Send(a, new { t = "deckPut", id = 3, deck = new { name = "bozuk" } });
        Assert.False((await Receive(a))!["ok"]!.GetValue<bool>());
    }

    [Fact]
    public async Task SettingsAndToken()
    {
        var r = await f.Http.SendAsync(Api(HttpMethod.Put, "/api/settings", new { deviceName = "Yayın PC", startWithWindows = true }));
        r.EnsureSuccessStatusCode();
        Assert.True(f.Platform.Autostart);
        Assert.Equal("Yayın PC", HubSettings.Load(Path.Combine(f.Dir, "settings.json")).DeviceName);
    }

    [Fact]
    public async Task DriverInstallGoesThroughElevation()
    {
        f.Sink.IsInstalled = false;
        var r = await f.Http.SendAsync(Api(HttpMethod.Post, "/api/webcam/driver", new { install = true }));
        var o = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
        Assert.True(o["webcam"]!["driverInstalled"]!.GetValue<bool>());
        Assert.Contains(f.Platform.Elevated, e => e.InstallDriver && e.DriverName == "CamLink Kamera");
    }

    [Fact]
    public void BeaconPayloadHasPorts()
    {
        var json = System.Text.Json.JsonSerializer.Serialize(f.Host.BeaconPayload());
        Assert.Contains("\"app\":\"studiohub\"", json);
        Assert.Contains($"\"hub\":{f.Port}", json);
        Assert.DoesNotContain("token", json);
    }
}

public class LockoutTests
{
    [Fact]
    public async Task LocksOutAfterRepeatedFailures()
    {
        await using var _ = await StartOwn(out var fx);
        for (var i = 0; i < 5; i++)
        {
            using var ws = await fx.Connect();
            await ws.SendAsync(Encoding.UTF8.GetBytes("""{"t":"hello","token":"no"}"""), WebSocketMessageType.Text, true, CancellationToken.None);
            var buf = new byte[4096];
            while ((await ws.ReceiveAsync(buf, CancellationToken.None)).MessageType != WebSocketMessageType.Close) { }
        }
        using var locked = await fx.Connect();
        var b = new byte[4096];
        var r = await locked.ReceiveAsync(b, CancellationToken.None);
        Assert.Equal(WebSocketMessageType.Close, r.MessageType);
        Assert.Equal(4029, (int)locked.CloseStatus!);
    }

    private static Task<HostFixture> StartOwn(out HostFixture fx)
    {
        fx = new HostFixture();
        var f = fx;
        return f.InitializeAsync().ContinueWith(_ => f);
    }
}

public class WebcamPipelineTests
{
    private const string LinuxFfmpeg = "/usr/local/bin/ffmpeg";

    private static int FreeUdpPort()
    {
        using var u = new UdpClient(0);
        return ((IPEndPoint)u.Client.LocalEndPoint!).Port;
    }

    [Fact]
    public async Task DecodesSrtIntoFlippedFrames()
    {
        if (!File.Exists(LinuxFfmpeg)) return;
        var port = FreeUdpPort();
        var sink = new FakeSink();
        var settings = new WebcamSettings { Width = 640, Height = 360, Fps = 30, FlipVertical = true };
        await using var svc = new WebcamService(LinuxFfmpeg, sink, () => settings, () => port);
        svc.Start();
        await Task.Delay(800);
        Assert.Equal(WebcamState.Waiting, svc.State);

        // Telefonu taklit eden gönderici: üstte kırmızı şerit olan mavi görüntü.
        var psi = new ProcessStartInfo(LinuxFfmpeg)
        {
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var a in new[]
        {
            "-hide_banner", "-loglevel", "error", "-re", "-f", "lavfi",
            "-i", "color=c=blue:s=1280x720:r=30,drawbox=x=0:y=0:w=1280:h=120:color=red:t=fill",
            "-t", "30", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-g", "15",
            "-f", "mpegts", $"srt://127.0.0.1:{port}?mode=caller&latency=120000",
        }) psi.ArgumentList.Add(a);
        using var sender = Process.Start(psi)!;

        var sw = Stopwatch.StartNew();
        while (Interlocked.Read(ref sink.Frames) < 30 && sw.Elapsed < TimeSpan.FromSeconds(15)) await Task.Delay(100);
        if (sink.Frames < 30)
        {
            sender.Kill();
            Assert.Fail($"kare gelmedi: {sink.Frames}, hata: {svc.LastError}, log: {string.Join(" | ", svc.RecentLog())}, gönderici: {sender.StandardError.ReadToEnd()}");
        }
        Assert.Equal(WebcamState.Receiving, svc.State);
        Assert.Equal((640, 360), (sink.LastWidth, sink.LastHeight));

        var frame = sink.Last!;
        static (byte r, byte g, byte b) Px(byte[] f, int x, int y) { var i = (y * 640 + x) * 4; return (f[i], f[i + 1], f[i + 2]); }
        // DirectShow alttan üste okuduğu için ilk satır görüntünün altı (mavi), son satır üstü (kırmızı) olmalı.
        var top = Px(frame, 320, 2);
        var bottom = Px(frame, 320, 357);
        Assert.True(top.b > 150 && top.r < 80, $"ilk satır mavi değil: {top}");
        Assert.True(bottom.r > 150 && bottom.b < 80, $"son satır kırmızı değil: {bottom}");

        var bmp = svc.PreviewBmp();
        Assert.NotNull(bmp);
        Assert.Equal((byte)'B', bmp![0]);
        // Kare hızı saniyelik pencerelerle ölçülür; gönderici gerçek zamanlı 30 kare/sn yollar.
        sw.Restart();
        while (svc.Fps < 20 && sw.Elapsed < TimeSpan.FromSeconds(6)) await Task.Delay(200);
        Assert.True(svc.Fps >= 20, $"fps {svc.Fps}");

        // Telefon yayını kesince alıcı yeniden dinlemeye dönmeli.
        sender.Kill();
        sender.WaitForExit(5000);
        sw.Restart();
        while (svc.State == WebcamState.Receiving && sw.Elapsed < TimeSpan.FromSeconds(10)) await Task.Delay(100);
        Assert.Equal(WebcamState.Waiting, svc.State);
    }
}
