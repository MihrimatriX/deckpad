using System.Diagnostics;
using System.Runtime.InteropServices;
using StudioHub.Core.Helper;
using static StudioHub.Platform.Native;

namespace StudioHub.Platform;

/// <summary>DeckPad'in bilgisayar eylemlerini Windows'ta gerçekleştirir.</summary>
public sealed class WindowsPc : IPcPlatform
{
    // Genişletilmiş tuşlar: bu bayrak olmadan ok tuşları sayısal tuş takımı gibi algılanır.
    private static readonly HashSet<ushort> Extended =
    [
        0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, // PgUp, PgDn, End, Home, oklar
        0x2C, 0x2D, 0x2E, // PrintScreen, Insert, Delete
        0x5B, 0x5C, 0x5D, // Win, Win, Menü
        0x6F, 0x90, // Num /, NumLock
        0xA3, 0xA5, // sağ Ctrl, sağ Alt
        0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xAB, 0xAC, // tarayıcı tuşları
        0xAD, 0xAE, 0xAF, 0xB0, 0xB1, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, // ses ve medya
    ];

    private static readonly int InputSize = Marshal.SizeOf<INPUT>();

    private static INPUT Key(ushort vk, bool up)
    {
        var flags = up ? KEYEVENTF_KEYUP : 0;
        if (Extended.Contains(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
        return new INPUT
        {
            type = INPUT_KEYBOARD,
            U = new InputUnion { ki = new KEYBDINPUT { wVk = vk, wScan = (ushort)MapVirtualKeyW(vk, 0), dwFlags = flags } },
        };
    }

    private static void Send(List<INPUT> inputs)
    {
        if (inputs.Count == 0) return;
        var sent = SendInput((uint)inputs.Count, inputs.ToArray(), InputSize);
        if (sent != inputs.Count)
            throw new InvalidOperationException("Tuşlar gönderilemedi. Yönetici olarak açık bir pencereye tuş gönderilemez.");
    }

    public Task SendKeysAsync(KeyCombo combo) => Task.Run(() =>
    {
        var list = new List<INPUT>();
        foreach (var m in combo.Modifiers) list.Add(Key(m, false));
        list.Add(Key(combo.Key, false));
        list.Add(Key(combo.Key, true));
        for (var i = combo.Modifiers.Count - 1; i >= 0; i--) list.Add(Key(combo.Modifiers[i], true));
        Send(list);
    });

    public Task TypeTextAsync(string text) => Task.Run(() =>
    {
        var list = new List<INPUT>();
        foreach (var ch in text.Replace("\r\n", "\n"))
        {
            if (ch == '\n')
            {
                list.Add(Key(0x0D, false));
                list.Add(Key(0x0D, true));
                continue;
            }
            // Unicode girişi klavye düzeninden bağımsızdır; Türkçe karakterler de doğru yazılır.
            foreach (var up in new[] { false, true })
            {
                list.Add(new INPUT
                {
                    type = INPUT_KEYBOARD,
                    U = new InputUnion { ki = new KEYBDINPUT { wScan = ch, dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0) } },
                });
            }
        }
        Send(list);
    });

    public Task LaunchAsync(string path, string? args)
    {
        var psi = new ProcessStartInfo(Environment.ExpandEnvironmentVariables(path)) { UseShellExecute = true };
        if (!string.IsNullOrWhiteSpace(args)) psi.Arguments = args;
        var dir = Path.GetDirectoryName(psi.FileName);
        if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir)) psi.WorkingDirectory = dir;
        Process.Start(psi)?.Dispose();
        return Task.CompletedTask;
    }

    public Task OpenUrlAsync(Uri url)
    {
        Process.Start(new ProcessStartInfo(url.ToString()) { UseShellExecute = true })?.Dispose();
        return Task.CompletedTask;
    }

    public Task MediaKeyAsync(MediaKey key)
    {
        ushort vk = key switch
        {
            MediaKey.Next => 0xB0,
            MediaKey.Previous => 0xB1,
            MediaKey.Stop => 0xB2,
            _ => 0xB3,
        };
        return SendKeysAsync(new KeyCombo([], vk, key.ToString()));
    }

    public Task<(int Level, bool Muted)> VolumeAsync(VolumeCommand cmd, int? value) => Task.Run(() => AudioEndpoint.Apply(cmd, value));

    public Task<string> SlideAsync(SlideCommand cmd) => Task.Run(async () =>
    {
        if (PowerPoint.TryRun(cmd)) return "PowerPoint";
        // PowerPoint yoksa ön plandaki pencereye (tarayıcıda slayt, PDF, Keynote web) tuş gönderilir.
        var combo = cmd switch
        {
            SlideCommand.Next => "Right",
            SlideCommand.Previous => "Left",
            SlideCommand.First => "Home",
            SlideCommand.Last => "End",
            SlideCommand.Start => "F5",
            SlideCommand.End => "Esc",
            _ => "B",
        };
        await SendKeysAsync(KeyCombo.Parse(combo));
        return "Ön plandaki pencere";
    });
}

/// <summary>Windows Core Audio ile varsayılan hoparlörün ses düzeyi.</summary>
internal static class AudioEndpoint
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumeratorCom;

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume
    {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int GetChannelCount(out uint count);
        [PreserveSig] int SetMasterVolumeLevel(float levelDb, ref Guid ctx);
        [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
        [PreserveSig] int GetMasterVolumeLevel(out float levelDb);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
        [PreserveSig] int SetChannelVolumeLevel(uint channel, float levelDb, ref Guid ctx);
        [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid ctx);
        [PreserveSig] int GetChannelVolumeLevel(uint channel, out float levelDb);
        [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    private const int eRender = 0, eMultimedia = 1, CLSCTX_ALL = 23;

    public static (int Level, bool Muted) Apply(VolumeCommand cmd, int? value)
    {
        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
        try
        {
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia, out var device));
            var iid = typeof(IAudioEndpointVolume).GUID;
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out var o));
            var vol = (IAudioEndpointVolume)o;
            var ctx = Guid.Empty;
            vol.GetMasterVolumeLevelScalar(out var level);
            vol.GetMute(out var muted);
            var step = (value ?? 5) / 100f;
            switch (cmd)
            {
                case VolumeCommand.Set:
                    vol.SetMasterVolumeLevelScalar(Math.Clamp((value ?? 50) / 100f, 0, 1), ref ctx);
                    if (muted) vol.SetMute(false, ref ctx);
                    break;
                case VolumeCommand.Up:
                    vol.SetMasterVolumeLevelScalar(Math.Clamp(level + step, 0, 1), ref ctx);
                    if (muted) vol.SetMute(false, ref ctx);
                    break;
                case VolumeCommand.Down:
                    vol.SetMasterVolumeLevelScalar(Math.Clamp(level - step, 0, 1), ref ctx);
                    break;
                case VolumeCommand.Mute:
                    vol.SetMute(true, ref ctx);
                    break;
                case VolumeCommand.Unmute:
                    vol.SetMute(false, ref ctx);
                    break;
                case VolumeCommand.ToggleMute:
                    vol.SetMute(!muted, ref ctx);
                    break;
            }
            vol.GetMasterVolumeLevelScalar(out level);
            vol.GetMute(out muted);
            Marshal.ReleaseComObject(vol);
            Marshal.ReleaseComObject(device);
            return ((int)Math.Round(level * 100), muted);
        }
        finally
        {
            Marshal.ReleaseComObject(enumerator);
        }
    }
}

/// <summary>Açık PowerPoint gösterisini COM ile yönetir; böylece pencere odakta olmasa da çalışır.</summary>
internal static class PowerPoint
{
    private const int ppSlideShowRunning = 1, ppSlideShowBlackScreen = 3;

    public static bool TryRun(SlideCommand cmd)
    {
        object? app = null;
        try
        {
            CLSIDFromProgID("PowerPoint.Application", out var clsid);
            GetActiveObject(ref clsid, IntPtr.Zero, out app);
        }
        catch
        {
            return false; // PowerPoint kurulu değil ya da açık değil
        }
        try
        {
            dynamic ppt = app;
            if (cmd == SlideCommand.Start)
            {
                if (ppt.Presentations.Count == 0) return false;
                if (ppt.SlideShowWindows.Count == 0) ppt.ActivePresentation.SlideShowSettings.Run();
                return true;
            }
            if (ppt.SlideShowWindows.Count == 0) return false;
            dynamic view = ppt.SlideShowWindows.Item(1).View;
            switch (cmd)
            {
                case SlideCommand.Next: view.Next(); break;
                case SlideCommand.Previous: view.Previous(); break;
                case SlideCommand.First: view.First(); break;
                case SlideCommand.Last: view.Last(); break;
                case SlideCommand.End: view.Exit(); break;
                case SlideCommand.Black:
                    view.State = (int)view.State == ppSlideShowBlackScreen ? ppSlideShowRunning : ppSlideShowBlackScreen;
                    break;
            }
            return true;
        }
        catch
        {
            return false;
        }
        finally
        {
            if (app != null && Marshal.IsComObject(app)) Marshal.ReleaseComObject(app);
        }
    }
}
