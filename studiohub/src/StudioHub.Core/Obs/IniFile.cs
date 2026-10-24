using System.Text;

namespace StudioHub.Core.Obs;

/// <summary>
/// OBS'in .ini dosyaları için satırları koruyan küçük düzenleyici.
/// Yalnızca istenen anahtarı değiştirir; yorumlar, sıralama ve BOM aynen kalır.
/// </summary>
public sealed class IniFile
{
    private readonly List<string> _lines;
    private readonly bool _bom;

    private IniFile(List<string> lines, bool bom)
    {
        _lines = lines;
        _bom = bom;
    }

    public static IniFile Load(string path)
    {
        if (!File.Exists(path)) return new IniFile([], true);
        var bytes = File.ReadAllBytes(path);
        var bom = bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF;
        var text = Encoding.UTF8.GetString(bytes, bom ? 3 : 0, bytes.Length - (bom ? 3 : 0));
        var lines = text.Replace("\r\n", "\n").Split('\n').ToList();
        if (lines.Count > 0 && lines[^1] == "") lines.RemoveAt(lines.Count - 1);
        return new IniFile(lines, bom);
    }

    public static IniFile Parse(string text)
    {
        var lines = text.Replace("\r\n", "\n").Split('\n').ToList();
        if (lines.Count > 0 && lines[^1] == "") lines.RemoveAt(lines.Count - 1);
        return new IniFile(lines, false);
    }

    public string? Get(string section, string key)
    {
        var (start, end) = FindSection(section);
        if (start < 0) return null;
        for (var i = start + 1; i < end; i++)
        {
            var (k, v) = SplitKey(_lines[i]);
            if (k != null && k.Equals(key, StringComparison.Ordinal)) return v;
        }
        return null;
    }

    public void Set(string section, string key, string value)
    {
        var (start, end) = FindSection(section);
        if (start < 0)
        {
            if (_lines.Count > 0 && _lines[^1].Trim() != "") _lines.Add("");
            _lines.Add($"[{section}]");
            _lines.Add($"{key}={value}");
            return;
        }
        for (var i = start + 1; i < end; i++)
        {
            var (k, _) = SplitKey(_lines[i]);
            if (k != null && k.Equals(key, StringComparison.Ordinal))
            {
                _lines[i] = $"{key}={value}";
                return;
            }
        }
        // Bölümün son dolu satırından sonra ekle.
        var insertAt = end;
        while (insertAt - 1 > start && _lines[insertAt - 1].Trim() == "") insertAt--;
        _lines.Insert(insertAt, $"{key}={value}");
    }

    public override string ToString() => string.Join("\r\n", _lines) + "\r\n";

    public void Save(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var body = Encoding.UTF8.GetBytes(ToString());
        using var fs = File.Create(path);
        if (_bom) fs.Write([0xEF, 0xBB, 0xBF]);
        fs.Write(body);
    }

    private (int start, int end) FindSection(string section)
    {
        var start = -1;
        for (var i = 0; i < _lines.Count; i++)
        {
            var t = _lines[i].Trim();
            if (t.StartsWith('[') && t.EndsWith(']'))
            {
                if (start >= 0) return (start, i);
                if (t[1..^1].Equals(section, StringComparison.Ordinal)) start = i;
            }
        }
        return start >= 0 ? (start, _lines.Count) : (-1, -1);
    }

    private static (string? key, string? value) SplitKey(string line)
    {
        var t = line.TrimStart();
        if (t.Length == 0 || t[0] is ';' or '#' or '[') return (null, null);
        var eq = line.IndexOf('=');
        return eq <= 0 ? (null, null) : (line[..eq].Trim(), line[(eq + 1)..]);
    }
}
