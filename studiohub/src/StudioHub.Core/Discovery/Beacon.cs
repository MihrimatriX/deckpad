using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using StudioHub.Core.Net;

namespace StudioHub.Core.Discovery;

/// <summary>
/// Telefonların bilgisayarı kendiliğinden bulması için yerel ağa her 2 saniyede bir duyuru yollar.
/// DeckPad ve CamLink UDP 4467'yi dinler; OBS eklentisi de aynı biçimde duyuru yapar.
/// </summary>
public sealed class Beacon : IAsyncDisposable
{
    public const int Port = 4467;

    private readonly Func<object> _payload;
    private readonly TimeSpan _interval;
    private readonly int _port;
    private CancellationTokenSource? _cts;
    private Task? _loop;

    public Beacon(Func<object> payload, TimeSpan? interval = null, int port = Port)
    {
        _payload = payload;
        _interval = interval ?? TimeSpan.FromSeconds(2);
        _port = port;
    }

    public long Sent { get; private set; }

    public void Start()
    {
        if (_loop != null) return;
        _cts = new CancellationTokenSource();
        _loop = Task.Run(() => RunAsync(_cts.Token));
    }

    private async Task RunAsync(CancellationToken ct)
    {
        using var udp = new UdpClient(AddressFamily.InterNetwork) { EnableBroadcast = true };
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var bytes = Encode(_payload());
                foreach (var target in Targets())
                {
                    try
                    {
                        await udp.SendAsync(bytes, new IPEndPoint(target, _port), ct);
                        Sent++;
                    }
                    catch (SocketException)
                    {
                        // Ağ değişirken bir hedef geçici olarak ulaşılamaz olabilir.
                    }
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception)
            {
                // Duyuru en iyi çaba ile yapılır; hata uygulamayı durdurmamalı.
            }
            try { await Task.Delay(_interval, ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    private static IEnumerable<IPAddress> Targets()
    {
        var seen = new HashSet<string>();
        foreach (var a in NetInfo.LanAddresses())
            if (a.Broadcast != null && seen.Add(a.Broadcast.ToString())) yield return a.Broadcast;
        if (seen.Add(IPAddress.Broadcast.ToString())) yield return IPAddress.Broadcast;
    }

    public static byte[] Encode(object payload) => Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload));

    public async ValueTask DisposeAsync()
    {
        if (_cts == null) return;
        _cts.Cancel();
        if (_loop != null)
        {
            try { await _loop; } catch { }
        }
        _cts.Dispose();
        _cts = null;
        _loop = null;
    }
}
