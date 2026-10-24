namespace StudioHub.Core.Helper;

/// <summary>
/// "Ctrl+Shift+F5" gibi bir kısayolu Windows sanal tuş kodlarına çevirir.
/// Değiştirici tuşlar önce basılır, ana tuş en son; bırakırken ters sırada bırakılır.
/// </summary>
public sealed record KeyCombo(IReadOnlyList<ushort> Modifiers, ushort Key, string Display)
{
    // Windows sanal tuş kodları (VK_*)
    public const ushort VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12, VK_LWIN = 0x5B;

    private static readonly Dictionary<string, ushort> ModifierMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ctrl"] = VK_CONTROL, ["control"] = VK_CONTROL, ["ctl"] = VK_CONTROL, ["strg"] = VK_CONTROL,
        ["shift"] = VK_SHIFT,
        ["alt"] = VK_MENU, ["option"] = VK_MENU, ["altgr"] = VK_MENU,
        ["win"] = VK_LWIN, ["windows"] = VK_LWIN, ["meta"] = VK_LWIN, ["cmd"] = VK_LWIN, ["super"] = VK_LWIN,
    };

    private static readonly Dictionary<string, ushort> KeyMap = BuildKeyMap();

    /// <summary>Her tuş kodunun gösterilecek adı (ilk kaydedilen ad).</summary>
    private static readonly Dictionary<ushort, string> KeyNames = BuildKeyNames();

    private static Dictionary<ushort, string> BuildKeyNames()
    {
        var names = new Dictionary<ushort, string>();
        foreach (var (name, vk) in KeyMap)
            names.TryAdd(vk, name.Length == 1 ? name.ToUpperInvariant() : name);
        return names;
    }

    private static Dictionary<string, ushort> BuildKeyMap()
    {
        var m = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase);
        for (var c = 'A'; c <= 'Z'; c++) m[c.ToString()] = c;
        for (var c = '0'; c <= '9'; c++) m[c.ToString()] = c;
        for (var i = 1; i <= 24; i++) m["F" + i] = (ushort)(0x70 + i - 1);
        for (var i = 0; i <= 9; i++) m["Num" + i] = m["Numpad" + i] = (ushort)(0x60 + i);
        void Add(ushort vk, params string[] names)
        {
            foreach (var n in names) m[n] = vk;
        }
        Add(0x0D, "Enter", "Return", "Giriş");
        Add(0x1B, "Esc", "Escape");
        Add(0x20, "Space", "Boşluk", "Bosluk");
        Add(0x09, "Tab");
        Add(0x08, "Backspace", "Back", "Geri");
        Add(0x2E, "Delete", "Del", "Sil");
        Add(0x2D, "Insert", "Ins");
        Add(0x24, "Home");
        Add(0x23, "End");
        Add(0x21, "PageUp", "PgUp");
        Add(0x22, "PageDown", "PgDn");
        Add(0x26, "Up", "Yukarı", "Yukari");
        Add(0x28, "Down", "Aşağı", "Asagi");
        Add(0x25, "Left", "Sol");
        Add(0x27, "Right", "Sağ", "Sag");
        Add(0x2C, "PrintScreen", "PrtSc", "PrtScn");
        Add(0x13, "Pause", "Break");
        Add(0x91, "ScrollLock");
        Add(0x14, "CapsLock");
        Add(0x6B, "NumPlus", "Add");
        Add(0x6D, "NumMinus", "Subtract");
        Add(0x6A, "NumMultiply", "Multiply");
        Add(0x6F, "NumDivide", "Divide");
        Add(0xBB, "Plus", "=");
        Add(0xBD, "Minus", "-");
        Add(0xBC, "Comma", ",");
        Add(0xBE, "Period", ".");
        Add(0xAD, "VolumeMute");
        Add(0xAE, "VolumeDown");
        Add(0xAF, "VolumeUp");
        Add(0xB0, "MediaNext");
        Add(0xB1, "MediaPrevious", "MediaPrev");
        Add(0xB2, "MediaStop");
        Add(0xB3, "MediaPlayPause", "PlayPause");
        return m;
    }

    public static KeyCombo Parse(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) throw new FormatException("Kısayol boş");
        // "+" tuşunun kendisi "Ctrl++" gibi yazılabilir.
        var raw = text.Trim();
        var parts = new List<string>();
        var cur = "";
        for (var i = 0; i < raw.Length; i++)
        {
            var ch = raw[i];
            if (ch == '+' && cur.Length > 0)
            {
                parts.Add(cur.Trim());
                cur = "";
            }
            else cur += ch;
        }
        if (cur.Length > 0) parts.Add(cur.Trim());
        parts.RemoveAll(p => p.Length == 0);
        if (parts.Count == 0) throw new FormatException("Kısayol boş");

        var mods = new List<ushort>();
        ushort? key = null;
        var shown = new List<string>();
        foreach (var p in parts)
        {
            if (ModifierMap.TryGetValue(p, out var mod))
            {
                if (!mods.Contains(mod)) mods.Add(mod);
                shown.Add(Pretty(p));
                continue;
            }
            if (key != null) throw new FormatException($"Kısayolda birden fazla ana tuş var: {text}");
            var name = p == "+" ? "Plus" : p;
            if (!KeyMap.TryGetValue(name, out var vk)) throw new FormatException($"Tanınmayan tuş: {p}");
            key = vk;
            shown.Add(KeyNames.TryGetValue(vk, out var display) ? display : name);
        }
        if (key == null)
        {
            // Yalnızca değiştirici (ör. "Win") verildiyse son değiştirici ana tuş sayılır.
            key = mods[^1];
            mods.RemoveAt(mods.Count - 1);
        }
        return new KeyCombo(mods, key.Value, string.Join("+", shown));
    }

    private static string Pretty(string mod) => mod.ToLowerInvariant() switch
    {
        "ctrl" or "control" or "ctl" or "strg" => "Ctrl",
        "shift" => "Shift",
        "alt" or "option" or "altgr" => "Alt",
        _ => "Win",
    };
}
