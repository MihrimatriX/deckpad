using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using StudioHub.Core.Helper;

namespace StudioHub.Core.Server;

public sealed record ClientInfo(string Id, string Name, string App, string Address, DateTimeOffset Since, string? LastAction, DateTimeOffset? LastActionAt);

/// <summary>
/// DeckPad'in bilgisayar eylemleri için WebSocket uç noktası.
/// İlk mesaj eşleştirme anahtarını taşıyan "hello" olmalı; aksi halde bağlantı kapanır.
/// </summary>
public sealed class HelperHub
{
    public const int ProtocolVersion = 1;
    private const int MaxMessage = 2 * 1024 * 1024;
    private static readonly string[] Caps = ["keys", "text", "launch", "url", "media", "volume", "slide", "deck"];

    private readonly Func<HubSettings> _settings;
    private readonly PcActionDispatcher _dispatcher;
    private readonly DeckStore _deck;
    private readonly ConcurrentDictionary<string, Session> _sessions = new();
    private readonly ConcurrentDictionary<string, (int fails, DateTimeOffset until)> _lockout = new();

    public HelperHub(Func<HubSettings> settings, PcActionDispatcher dispatcher, DeckStore deck)
    {
        _settings = settings;
        _dispatcher = dispatcher;
        _deck = deck;
        _deck.Changed += origin => _ = BroadcastAsync(new JsonObject { ["t"] = "deckChanged" }, exceptId: origin);
    }

    public IReadOnlyList<ClientInfo> Clients =>
        _sessions.Values.Where(s => s.Authed).Select(s => s.Info()).OrderBy(c => c.Since).ToList();

    public event Action? ClientsChanged;

    /// <summary>Anahtar yenilenince eski anahtarla bağlı herkes düşürülür.</summary>
    public async Task DisconnectAllAsync(string reason)
    {
        foreach (var s in _sessions.Values) await s.CloseAsync(4003, reason);
    }

    public async Task HandleAsync(WebSocket ws, IPAddress? remote, CancellationToken ct)
    {
        var addr = remote?.IsIPv4MappedToIPv6 == true ? remote.MapToIPv4().ToString() : remote?.ToString() ?? "?";
        if (_lockout.TryGetValue(addr, out var lo) && lo.until > DateTimeOffset.Now)
        {
            await SafeClose(ws, 4029, "Çok fazla hatalı deneme. Biraz bekle.");
            return;
        }
        var s = new Session(ws, addr);
        _sessions[s.Id] = s;
        try
        {
            using var helloCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            helloCts.CancelAfter(TimeSpan.FromSeconds(10));
            var first = await ReceiveAsync(ws, helloCts.Token);
            if (first == null || first["t"]?.GetValue<string>() != "hello")
            {
                await SafeClose(ws, 4000, "İlk mesaj hello olmalı");
                return;
            }
            var token = first["token"]?.GetValue<string>() ?? "";
            if (!TokenEquals(token, _settings().PairToken))
            {
                var f = _lockout.AddOrUpdate(addr, _ => (1, DateTimeOffset.MinValue), (_, v) => (v.fails + 1, v.until));
                if (f.fails >= 5) _lockout[addr] = (0, DateTimeOffset.Now.AddMinutes(1));
                await s.SendAsync(new JsonObject { ["t"] = "error", ["code"] = "auth", ["message"] = "Eşleştirme kodu geçersiz. QR kodunu yeniden okut." });
                await SafeClose(ws, 4001, "auth");
                return;
            }
            _lockout.TryRemove(addr, out _);
            s.Name = Clean(first["name"]?.GetValue<string>(), 40) ?? "DeckPad";
            s.App = Clean(first["app"]?.GetValue<string>(), 20) ?? "deckpad";
            s.Authed = true;
            ClientsChanged?.Invoke();
            var st = _settings();
            await s.SendAsync(new JsonObject
            {
                ["t"] = "welcome",
                ["v"] = ProtocolVersion,
                ["name"] = st.DeviceName,
                ["caps"] = new JsonArray(Caps.Select(c => (JsonNode)c).ToArray()),
                ["clientId"] = s.Id,
            });

            while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                var msg = await ReceiveAsync(ws, ct);
                if (msg == null) break;
                var reply = await HandleMessageAsync(s, msg);
                if (reply != null) await s.SendAsync(reply);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (WebSocketException)
        {
        }
        finally
        {
            _sessions.TryRemove(s.Id, out _);
            if (s.Authed) ClientsChanged?.Invoke();
        }
    }

    internal async Task<JsonObject?> HandleMessageAsync(Session s, JsonObject msg)
    {
        var t = msg["t"]?.GetValue<string>();
        var id = msg["id"]?.DeepClone();
        switch (t)
        {
            case "ping":
                return new JsonObject { ["t"] = "pong", ["id"] = id };
            case "run":
                {
                    PcAction? action;
                    try
                    {
                        action = msg["action"]?.Deserialize<PcAction>();
                    }
                    catch (JsonException)
                    {
                        action = null;
                    }
                    if (action == null) return Result(id, new ActionResult(false, "Eylem okunamadı"));
                    var r = await _dispatcher.RunAsync(action);
                    s.LastAction = Describe(action) + (r.Ok ? "" : $" (hata: {r.Message})");
                    s.LastActionAt = DateTimeOffset.Now;
                    ClientsChanged?.Invoke();
                    return Result(id, r);
                }
            case "deckGet":
                return new JsonObject
                {
                    ["t"] = "deck",
                    ["id"] = id,
                    ["deck"] = _deck.Read(),
                    ["updatedAt"] = _deck.UpdatedAt?.ToUnixTimeMilliseconds(),
                };
            case "deckPut":
                {
                    var deck = msg["deck"];
                    var err = deck == null ? "Düzen boş" : _deck.Write(deck.DeepClone(), s.Id);
                    return new JsonObject { ["t"] = "deckSaved", ["id"] = id, ["ok"] = err == null, ["message"] = err };
                }
            default:
                return new JsonObject { ["t"] = "error", ["id"] = id, ["code"] = "unknown", ["message"] = $"Bilinmeyen mesaj: {t}" };
        }
    }

    private static JsonObject Result(JsonNode? id, ActionResult r)
    {
        var o = new JsonObject { ["t"] = "result", ["id"] = id, ["ok"] = r.Ok };
        if (r.Message != null) o["message"] = r.Message;
        if (r.Data != null) o["data"] = JsonSerializer.SerializeToNode(r.Data);
        return o;
    }

    private static string Describe(PcAction a) => a.Op switch
    {
        "keys" => $"Kısayol {a.Keys}",
        "text" => "Metin yazma",
        "launch" => $"{System.IO.Path.GetFileNameWithoutExtension(a.Path ?? "")} açıldı",
        "url" => "Bağlantı açıldı",
        "media" => a.Key switch
        {
            "playPause" => "Oynat/duraklat",
            "next" => "Sonraki parça",
            "previous" => "Önceki parça",
            _ => "Medyayı durdur",
        },
        "volume" => a.Mode switch
        {
            "set" => $"Ses %{a.Value}",
            "up" => "Sesi artır",
            "down" => "Sesi azalt",
            "mute" => "Sesi kapat",
            "unmute" => "Sesi aç",
            _ => "Sessiz aç/kapat",
        },
        "slide" => a.Dir switch
        {
            "next" => "Sonraki slayt",
            "previous" => "Önceki slayt",
            "first" => "İlk slayt",
            "last" => "Son slayt",
            "start" => "Sunumu başlat",
            "end" => "Sunumu bitir",
            _ => "Siyah ekran",
        },
        _ => a.Op,
    };

    private async Task BroadcastAsync(JsonObject msg, string? exceptId)
    {
        foreach (var s in _sessions.Values.Where(x => x.Authed && x.Id != exceptId))
        {
            try { await s.SendAsync(msg); }
            catch { }
        }
    }

    internal static bool TokenEquals(string a, string b)
    {
        var x = Encoding.UTF8.GetBytes(a);
        var y = Encoding.UTF8.GetBytes(b);
        return x.Length == y.Length && CryptographicOperations.FixedTimeEquals(x, y);
    }

    private static string? Clean(string? s, int max)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        s = new string(s.Where(c => !char.IsControl(c)).ToArray()).Trim();
        return s.Length > max ? s[..max] : s;
    }

    private static async Task<JsonObject?> ReceiveAsync(WebSocket ws, CancellationToken ct)
    {
        var buf = new byte[16 * 1024];
        using var ms = new MemoryStream();
        while (true)
        {
            var r = await ws.ReceiveAsync(buf, ct);
            if (r.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buf, 0, r.Count);
            if (ms.Length > MaxMessage) throw new WebSocketException("Mesaj çok büyük");
            if (r.EndOfMessage) break;
        }
        try
        {
            return JsonNode.Parse(ms.ToArray()) as JsonObject ?? new JsonObject();
        }
        catch (JsonException)
        {
            return new JsonObject();
        }
    }

    private static async Task SafeClose(WebSocket ws, int code, string reason)
    {
        try
        {
            if (ws.State == WebSocketState.Open)
                await ws.CloseAsync((WebSocketCloseStatus)code, reason, CancellationToken.None);
        }
        catch
        {
        }
    }

    internal sealed class Session(WebSocket ws, string address)
    {
        private readonly SemaphoreSlim _send = new(1, 1);
        public string Id { get; } = Guid.NewGuid().ToString("N")[..10];
        public string Address => address;
        public DateTimeOffset Since { get; } = DateTimeOffset.Now;
        public bool Authed { get; set; }
        public string Name { get; set; } = "";
        public string App { get; set; } = "";
        public string? LastAction { get; set; }
        public DateTimeOffset? LastActionAt { get; set; }

        public ClientInfo Info() => new(Id, Name, App, address, Since, LastAction, LastActionAt);

        public async Task SendAsync(JsonObject msg)
        {
            var bytes = Encoding.UTF8.GetBytes(msg.ToJsonString());
            await _send.WaitAsync();
            try
            {
                if (ws.State == WebSocketState.Open)
                    await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
            }
            finally
            {
                _send.Release();
            }
        }

        public Task CloseAsync(int code, string reason) => SafeClose(ws, code, reason);
    }
}
