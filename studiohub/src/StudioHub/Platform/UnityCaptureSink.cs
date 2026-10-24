using System.Runtime.InteropServices;
using Microsoft.Win32;
using StudioHub.Core.Webcam;
using static StudioHub.Platform.Native;

namespace StudioHub.Platform;

/// <summary>
/// Unity Capture DirectShow sürücüsüne paylaşılan bellekle kare yollar.
/// Sürücü (alıcı) kamerayı açan uygulamanın içinde yüklenir; o uygulama açık değilken nesneler yoktur.
/// Protokol: Unity Capture "shared.inl" (MIT lisansı, Bernhard Schelling).
/// </summary>
public sealed class UnityCaptureSink : IFrameSink
{
    public const string FilterClsid64 = "{5C2CD55C-92AD-4999-8666-912BD3E70010}";
    public const string FilterClsid32 = "{5C2CD55C-92AD-4999-8666-912BD3E70020}";

    // Sürücünün ilk cihazı için adlar (cihaz numarası 0 olunca sondaki rakam yoktur).
    private const string MutexName = "UnityCapture_Mutx";
    private const string WantName = "UnityCapture_Want";
    private const string SentName = "UnityCapture_Sent";
    private const string DataName = "UnityCapture_Data";
    private const int HeaderSize = 32;
    private const int FormatUint8 = 0, ResizeLinear = 1, MirrorNone = 0, TimeoutMs = 1500;

    private readonly object _lock = new();
    private IntPtr _mutex, _want, _sent, _map, _view;
    private DateTime _nextOpenTry;
    private DateTime _lastWant;
    private DateTime _lastWrite;
    private bool _disposed;

    public UnityCaptureSink(string deviceName) => DeviceName = deviceName;

    public string DeviceName { get; }

    public bool IsInstalled
    {
        get
        {
            using var key = RegistryKey.OpenBaseKey(RegistryHive.ClassesRoot, RegistryView.Registry64).OpenSubKey($@"CLSID\{FilterClsid64}");
            return key != null;
        }
    }

    /// <summary>Son iki saniyede kamerayı okuyan bir uygulama kare istediyse true.</summary>
    public bool HasConsumer => DateTime.UtcNow - _lastWant < TimeSpan.FromSeconds(2);

    private bool Open()
    {
        if (_view != IntPtr.Zero) return true;
        if (DateTime.UtcNow < _nextOpenTry) return false;
        _nextOpenTry = DateTime.UtcNow.AddMilliseconds(500);

        // Alıcı yoksa (kamerayı açan uygulama yoksa) muteks de yoktur.
        if (_mutex == IntPtr.Zero) _mutex = OpenMutexA(SYNCHRONIZE, false, MutexName);
        if (_mutex == IntPtr.Zero) return false;
        if (WaitForSingleObject(_mutex, 200) != WAIT_OBJECT_0) return false;
        try
        {
            if (_want == IntPtr.Zero) _want = CreateEventA(IntPtr.Zero, false, false, WantName);
            if (_want == IntPtr.Zero) return false;
            if (_sent == IntPtr.Zero) _sent = OpenEventA(EVENT_MODIFY_STATE, false, SentName);
            if (_sent == IntPtr.Zero) return false;
            if (_map == IntPtr.Zero) _map = OpenFileMappingA(FILE_MAP_WRITE, false, DataName);
            if (_map == IntPtr.Zero) return false;
            _view = MapViewOfFile(_map, FILE_MAP_WRITE, 0, 0, UIntPtr.Zero);
            return _view != IntPtr.Zero;
        }
        finally
        {
            ReleaseMutex(_mutex);
        }
    }

    public unsafe void Write(ReadOnlySpan<byte> rgba, int width, int height)
    {
        lock (_lock)
        {
            if (_disposed || !Open()) return;
            // Kamerayı okuyan uygulama kapandıysa her kareyi kopyalamak boşa iş; arada bir yoklanır.
            if (!HasConsumer && DateTime.UtcNow - _lastWrite < TimeSpan.FromMilliseconds(400)) return;
            _lastWrite = DateTime.UtcNow;
            var size = width * height * 4;
            var max = (uint)Marshal.ReadInt32(_view, 0);
            if (max < size) return;
            if (WaitForSingleObject(_mutex, 100) != WAIT_OBJECT_0) return;
            try
            {
                Marshal.WriteInt32(_view, 4, width);
                Marshal.WriteInt32(_view, 8, height);
                Marshal.WriteInt32(_view, 12, width); // satır aralığı, piksel cinsinden
                Marshal.WriteInt32(_view, 16, FormatUint8);
                Marshal.WriteInt32(_view, 20, ResizeLinear); // uygulama başka çözünürlük isterse ölçeklenir
                Marshal.WriteInt32(_view, 24, MirrorNone);
                Marshal.WriteInt32(_view, 28, TimeoutMs);
                rgba[..size].CopyTo(new Span<byte>((byte*)_view + HeaderSize, size));
            }
            finally
            {
                ReleaseMutex(_mutex);
            }
            SetEvent(_sent);
            // Alıcı yeni kare istediyse "Want" olayı işaretlidir; okumak olayı sıfırlar.
            if (WaitForSingleObject(_want, 0) == WAIT_OBJECT_0) _lastWant = DateTime.UtcNow;
        }
    }

    private void CloseAll()
    {
        if (_view != IntPtr.Zero) UnmapViewOfFile(_view);
        foreach (var h in new[] { _map, _sent, _want, _mutex })
            if (h != IntPtr.Zero) CloseHandle(h);
        _view = _map = _sent = _want = _mutex = IntPtr.Zero;
    }

    public void Dispose()
    {
        lock (_lock)
        {
            _disposed = true;
            CloseAll();
        }
    }
}
