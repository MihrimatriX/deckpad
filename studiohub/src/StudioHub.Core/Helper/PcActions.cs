using System.Text.Json.Serialization;

namespace StudioHub.Core.Helper;

/// <summary>DeckPad'in bilgisayarda çalıştırdığı eylem. "op" alanı türü belirler.</summary>
public sealed class PcAction
{
    [JsonPropertyName("op")] public string Op { get; set; } = "";
    [JsonPropertyName("keys")] public string? Keys { get; set; }
    [JsonPropertyName("text")] public string? Text { get; set; }
    [JsonPropertyName("path")] public string? Path { get; set; }
    [JsonPropertyName("args")] public string? Args { get; set; }
    [JsonPropertyName("url")] public string? Url { get; set; }
    [JsonPropertyName("key")] public string? Key { get; set; }
    [JsonPropertyName("mode")] public string? Mode { get; set; }
    [JsonPropertyName("value")] public int? Value { get; set; }
    [JsonPropertyName("dir")] public string? Dir { get; set; }
}

public enum MediaKey { PlayPause, Next, Previous, Stop }

public enum VolumeCommand { Set, Up, Down, Mute, Unmute, ToggleMute }

public enum SlideCommand { Next, Previous, First, Last, Start, End, Black }

/// <summary>Windows'a özgü işler. Windows uygulaması gerçeğini, testler sahtesini verir.</summary>
public interface IPcPlatform
{
    Task SendKeysAsync(KeyCombo combo);
    Task TypeTextAsync(string text);
    Task LaunchAsync(string path, string? args);
    Task OpenUrlAsync(Uri url);
    Task MediaKeyAsync(MediaKey key);
    /// <summary>Ses düzeyini değiştirir; yeni düzeyi (0-100) ve sessiz durumunu döner.</summary>
    Task<(int Level, bool Muted)> VolumeAsync(VolumeCommand cmd, int? value);
    /// <summary>PowerPoint gösterisi açıksa onu, değilse ön plandaki pencereyi kontrol eder.</summary>
    Task<string> SlideAsync(SlideCommand cmd);
}

public sealed record ActionResult(bool Ok, string? Message = null, object? Data = null);

/// <summary>Gelen eylemi doğrular ve platforma iletir.</summary>
public sealed class PcActionDispatcher(IPcPlatform platform)
{
    public async Task<ActionResult> RunAsync(PcAction a)
    {
        try
        {
            switch (a.Op)
            {
                case "keys":
                    {
                        var combo = KeyCombo.Parse(a.Keys ?? "");
                        await platform.SendKeysAsync(combo);
                        return new ActionResult(true, combo.Display);
                    }
                case "text":
                    if (string.IsNullOrEmpty(a.Text)) return Fail("Yazılacak metin boş");
                    if (a.Text.Length > 2000) return Fail("Metin en fazla 2000 karakter olabilir");
                    await platform.TypeTextAsync(a.Text);
                    return new ActionResult(true);
                case "launch":
                    if (string.IsNullOrWhiteSpace(a.Path)) return Fail("Açılacak uygulama yolu boş");
                    await platform.LaunchAsync(a.Path.Trim().Trim('"'), a.Args);
                    return new ActionResult(true);
                case "url":
                    if (!Uri.TryCreate(a.Url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
                        return Fail("Adres http:// veya https:// ile başlamalı");
                    await platform.OpenUrlAsync(uri);
                    return new ActionResult(true);
                case "media":
                    {
                        var key = a.Key switch
                        {
                            "playPause" => MediaKey.PlayPause,
                            "next" => MediaKey.Next,
                            "previous" => MediaKey.Previous,
                            "stop" => MediaKey.Stop,
                            _ => (MediaKey?)null,
                        };
                        if (key == null) return Fail($"Bilinmeyen medya tuşu: {a.Key}");
                        await platform.MediaKeyAsync(key.Value);
                        return new ActionResult(true);
                    }
                case "volume":
                    {
                        var cmd = a.Mode switch
                        {
                            "set" => VolumeCommand.Set,
                            "up" => VolumeCommand.Up,
                            "down" => VolumeCommand.Down,
                            "mute" => VolumeCommand.Mute,
                            "unmute" => VolumeCommand.Unmute,
                            "toggleMute" => VolumeCommand.ToggleMute,
                            _ => (VolumeCommand?)null,
                        };
                        if (cmd == null) return Fail($"Bilinmeyen ses komutu: {a.Mode}");
                        int? value = cmd == VolumeCommand.Set ? Math.Clamp(a.Value ?? 50, 0, 100) : a.Value is int v ? Math.Clamp(v, 1, 50) : null;
                        var (level, muted) = await platform.VolumeAsync(cmd.Value, value);
                        return new ActionResult(true, muted ? "Sessiz" : $"%{level}", new { level, muted });
                    }
                case "slide":
                    {
                        var cmd = a.Dir switch
                        {
                            "next" => SlideCommand.Next,
                            "previous" => SlideCommand.Previous,
                            "first" => SlideCommand.First,
                            "last" => SlideCommand.Last,
                            "start" => SlideCommand.Start,
                            "end" => SlideCommand.End,
                            "black" => SlideCommand.Black,
                            _ => (SlideCommand?)null,
                        };
                        if (cmd == null) return Fail($"Bilinmeyen slayt komutu: {a.Dir}");
                        var where = await platform.SlideAsync(cmd.Value);
                        return new ActionResult(true, where);
                    }
                default:
                    return Fail($"Bilinmeyen eylem: {a.Op}");
            }
        }
        catch (FormatException e)
        {
            return Fail(e.Message);
        }
        catch (Exception e)
        {
            return Fail(e.Message);
        }
    }

    private static ActionResult Fail(string m) => new(false, m);
}
