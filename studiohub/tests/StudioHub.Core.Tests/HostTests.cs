using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using StudioHub.Core;
using StudioHub.Core.Obs;
using StudioHub.Core.Server;
using StudioHub.Dev;

namespace StudioHub.Core.Tests;

public sealed class HostFixture : IAsyncLifetime
{
    public readonly string Dir = Directory.CreateTempSubdirectory("hub-test").FullName;
    public readonly FakePc Pc = new();
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
        settings.Save(Path.Combine(Dir, "settings.json"));
        var panel = Path.Combine(Dir, "panel");
        var admin = Path.Combine(Dir, "admin");
        Directory.CreateDirectory(panel);
        Directory.CreateDirectory(admin);
        File.WriteAllText(Path.Combine(panel, "index.html"), "<html>panel</html>");
        File.WriteAllText(Path.Combine(panel, "app.js"), "console.log(1)");
        File.WriteAllText(Path.Combine(admin, "index.html"), "<html>hub</html>");
        File.WriteAllText(Path.Combine(admin, "app.js"), "console.log(2)");
        Platform = new FakePlatform();
        Host = new HubHost(new HubOptions
        {
            SettingsPath = Path.Combine(Dir, "settings.json"),
            DeckPath = Path.Combine(Dir, "deck.json"),
            PanelRoot = panel,
            AdminRoot = admin,
        }, Platform, Pc, new ObsConfigurator(Path.Combine(Dir, "obs"), () => false));
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
    public async Task AdminScriptIsRevalidated()
    {
        // Yönetim arayüzünün app.js'i sürümsüz adla gelir; güncellemeden sonra eskisi kalmamalı.
        var admin = await f.Http.GetAsync("/hub/app.js");
        Assert.True(admin.Headers.CacheControl!.NoCache);
        var panel = await f.Http.GetAsync("/app.js");
        Assert.Equal(TimeSpan.FromHours(1), panel.Headers.CacheControl!.MaxAge);
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
    public async Task PairUsesObsOwnPassword()
    {
        // "OBS'i hazırla" hiç çalışmamış (ayarda şifre yok) ama OBS'te şifre var: QR yine de onu taşımalı.
        var cfg = Path.Combine(f.Dir, "obs", "plugin_config", "obs-websocket", "config.json");
        Directory.CreateDirectory(Path.GetDirectoryName(cfg)!);
        File.WriteAllText(cfg, """{"server_enabled":true,"auth_required":true,"server_password":"obs-sifresi"}""");
        try
        {
            var s = JsonNode.Parse(await (await f.Http.SendAsync(Api(HttpMethod.Get, "/api/status"))).Content.ReadAsStringAsync())!;
            Assert.True(s["obsHasPassword"]!.GetValue<bool>());
            Assert.Contains("pass=obs-sifresi", s["pairUri"]!.GetValue<string>());
        }
        finally { File.Delete(cfg); }
    }

    [Fact]
    public async Task QrIsSvg()
    {
        var r = await f.Http.SendAsync(Api(HttpMethod.Get, "/api/qr.svg"));
        Assert.Equal("image/svg+xml", r.Content.Headers.ContentType!.MediaType);
        var svg = await r.Content.ReadAsStringAsync();
        Assert.Contains("<svg", svg);
        Assert.Contains("viewBox=", svg);
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
    public async Task FirewallGoesThroughElevation()
    {
        var r = await f.Http.SendAsync(Api(HttpMethod.Post, "/api/firewall"));
        var o = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
        Assert.True(o["firewall"]!.GetValue<bool>());
        Assert.Contains(f.Platform.Elevated, e => e.FirewallTcp.SequenceEqual(new[] { f.Port }));
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
