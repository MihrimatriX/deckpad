using StudioHub.Core;
using StudioHub.Core.Helper;
using StudioHub.Core.Obs;
using StudioHub.Core.Server;
using StudioHub.Core.Webcam;

namespace StudioHub.Dev;

/// <summary>Windows dışında geliştirme ve test için sahte platform. Her çağrıyı kaydeder.</summary>
public sealed class FakePc : IPcPlatform
{
    public List<string> Calls { get; } = [];
    private int _level = 40;
    private bool _muted;

    private void Log(string s)
    {
        lock (Calls) Calls.Add(s);
        Console.WriteLine("[pc] " + s);
    }

    public Task SendKeysAsync(KeyCombo combo)
    {
        Log($"keys {combo.Display} mods={string.Join(",", combo.Modifiers.Select(m => m.ToString("X2")))} key={combo.Key:X2}");
        return Task.CompletedTask;
    }

    public Task TypeTextAsync(string text) { Log("text " + text); return Task.CompletedTask; }
    public Task LaunchAsync(string path, string? args) { Log($"launch {path} {args}".Trim()); return Task.CompletedTask; }
    public Task OpenUrlAsync(Uri url) { Log("url " + url); return Task.CompletedTask; }
    public Task MediaKeyAsync(MediaKey key) { Log("media " + key); return Task.CompletedTask; }

    public Task<(int Level, bool Muted)> VolumeAsync(VolumeCommand cmd, int? value)
    {
        switch (cmd)
        {
            case VolumeCommand.Set: _level = value ?? _level; break;
            case VolumeCommand.Up: _level = Math.Min(100, _level + (value ?? 5)); break;
            case VolumeCommand.Down: _level = Math.Max(0, _level - (value ?? 5)); break;
            case VolumeCommand.Mute: _muted = true; break;
            case VolumeCommand.Unmute: _muted = false; break;
            case VolumeCommand.ToggleMute: _muted = !_muted; break;
        }
        Log($"volume {cmd} {value} -> {_level} muted={_muted}");
        return Task.FromResult((_level, _muted));
    }

    public Task<string> SlideAsync(SlideCommand cmd) { Log("slide " + cmd); return Task.FromResult("Ön plandaki pencere"); }
}

public sealed class FakeSink : IFrameSink
{
    public long Frames;
    public int LastWidth, LastHeight;
    public byte[]? Last;
    public bool IsInstalled { get; set; } = true;
    public bool HasConsumer { get; set; }
    public string DeviceName => "CamLink Kamera";

    public void Write(ReadOnlySpan<byte> rgba, int width, int height)
    {
        Interlocked.Increment(ref Frames);
        LastWidth = width;
        LastHeight = height;
        Last = rgba.ToArray();
    }

    public void Dispose() { }
}

public sealed class FakePlatform(FakeSink sink) : IHubPlatform
{
    public bool ObsRunning { get; set; }
    public List<ElevatedRequest> Elevated { get; } = [];
    public string OsName => "Linux (geliştirme)";
    public bool IsObsRunning() => ObsRunning;
    public bool CanLaunchObs => true;
    public Task LaunchObsAsync() { Console.WriteLine("[platform] OBS başlatılıyor"); return Task.CompletedTask; }
    public bool DriverInstalled => sink.IsInstalled;
    public bool Firewall { get; set; }
    public bool FirewallConfigured(HubSettings s) => Firewall;

    public Task<IReadOnlyList<SetupStep>> RunElevatedAsync(ElevatedRequest req)
    {
        Elevated.Add(req);
        var steps = new List<SetupStep>();
        if (req.InstallDriver) { sink.IsInstalled = true; steps.Add(new("driver", "Sanal kamera sürücüsü", true, $"\"{req.DriverName}\" kuruldu")); }
        if (req.UninstallDriver) { sink.IsInstalled = false; steps.Add(new("driver", "Sanal kamera sürücüsü", true, "Kaldırıldı")); }
        if (req.FirewallTcp != null || req.FirewallUdp != null) { Firewall = true; steps.Add(new("firewall", "Güvenlik duvarı", true, "İzinler eklendi")); }
        if (req.PluginSource != null && req.PluginTarget != null)
        {
            ObsConfigurator.CopyDir(req.PluginSource, req.PluginTarget);
            steps.Add(new("plugin", "CamLink OBS eklentisi", true, "Kuruldu"));
        }
        return Task.FromResult<IReadOnlyList<SetupStep>>(steps);
    }

    public bool Autostart { get; set; }
    public void OpenPanelWindow() => Console.WriteLine("[platform] DeckPad penceresi açılıyor");
    public void OpenExternal(string url) => Console.WriteLine("[platform] tarayıcı: " + url);
}
