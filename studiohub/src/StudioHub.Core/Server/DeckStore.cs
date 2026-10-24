using System.Text.Json;
using System.Text.Json.Nodes;

namespace StudioHub.Core.Server;

/// <summary>
/// DeckPad masaüstü paneli, OBS paneli ve telefon aynı tuş düzenini paylaşabilsin diye
/// düzen bilgisayarda tek bir JSON dosyasında tutulur.
/// </summary>
public sealed class DeckStore(string path)
{
    private readonly object _lock = new();
    public const int MaxBytes = 2 * 1024 * 1024;

    public event Action<string?>? Changed;

    public string Path => path;

    public JsonNode? Read()
    {
        lock (_lock)
        {
            try
            {
                return File.Exists(path) ? JsonNode.Parse(File.ReadAllText(path)) : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }
    }

    public DateTimeOffset? UpdatedAt => File.Exists(path) ? File.GetLastWriteTimeUtc(path) : null;

    /// <summary>Düzeni kaydeder. Biçimi kabaca doğrular; ayrıntılı doğrulamayı DeckPad yapar.</summary>
    public string? Write(JsonNode deck, string? origin)
    {
        if (deck is not JsonObject o || o["pages"] is not JsonArray) return "Geçersiz düzen: \"pages\" listesi yok";
        var text = deck.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        if (text.Length > MaxBytes) return "Düzen çok büyük";
        lock (_lock)
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path)!);
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, text);
            File.Move(tmp, path, overwrite: true);
        }
        Changed?.Invoke(origin);
        return null;
    }
}
