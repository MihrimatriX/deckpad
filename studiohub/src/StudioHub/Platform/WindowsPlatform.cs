using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.Win32;
using StudioHub.Core;
using StudioHub.Core.Obs;
using StudioHub.Core.Server;

namespace StudioHub.Platform;

public sealed class WindowsPlatform(Action openPanel) : IHubPlatform
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValue = "StudioHub";
    private bool? _firewall;
    private DateTime _firewallCheckedAt;

    public string OsName => Environment.OSVersion.Version.Build >= 22000 ? "Windows 11" : "Windows 10";

    public bool IsObsRunning() =>
        Process.GetProcessesByName("obs64").Length > 0 || Process.GetProcessesByName("obs").Length > 0 || Process.GetProcessesByName("obs32").Length > 0;

    /// <summary>OBS'in kurulum klasörü kurulum programının yazdığı kayıt anahtarından okunur.</summary>
    private static string? ObsExe()
    {
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var key = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view).OpenSubKey(@"SOFTWARE\OBS Studio");
            if (key?.GetValue(null) is string dir)
            {
                var exe = Path.Combine(dir, "bin", "64bit", "obs64.exe");
                if (File.Exists(exe)) return exe;
            }
        }
        var fallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "obs-studio", "bin", "64bit", "obs64.exe");
        return File.Exists(fallback) ? fallback : null;
    }

    public bool CanLaunchObs => ObsExe() != null;

    public Task LaunchObsAsync()
    {
        var exe = ObsExe();
        if (exe == null) return Task.CompletedTask;
        // OBS dosyalarını çalışma klasörüne göre arar; klasör verilmezse "locale" hatası verir.
        Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = Path.GetDirectoryName(exe)!, UseShellExecute = true })?.Dispose();
        return Task.CompletedTask;
    }

    public bool FirewallConfigured(HubSettings s)
    {
        // netsh'i her durum sorgusunda çalıştırmamak için sonuç bir süre saklanır.
        if (_firewall is bool cached && DateTime.UtcNow - _firewallCheckedAt < TimeSpan.FromMinutes(2)) return cached;
        _firewallCheckedAt = DateTime.UtcNow;
        _ = Task.Run(() =>
        {
            try
            {
                var psi = new ProcessStartInfo("netsh", "advfirewall firewall show rule name=\"StudioHub (TCP)\"")
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                };
                using var p = Process.Start(psi)!;
                var output = p.StandardOutput.ReadToEnd();
                p.WaitForExit(5000);
                _firewall = p.ExitCode == 0 && output.Contains(s.HubPort.ToString());
            }
            catch
            {
                _firewall = false;
            }
        });
        return _firewall ?? false;
    }

    public async Task<IReadOnlyList<SetupStep>> RunElevatedAsync(ElevatedRequest req)
    {
        var dir = Path.Combine(Path.GetTempPath(), "StudioHub");
        Directory.CreateDirectory(dir);
        var id = Guid.NewGuid().ToString("N");
        var reqPath = Path.Combine(dir, $"istek-{id}.json");
        var resPath = Path.Combine(dir, $"sonuc-{id}.json");
        await File.WriteAllTextAsync(reqPath, JsonSerializer.Serialize(req));
        try
        {
            var psi = new ProcessStartInfo(Environment.ProcessPath!)
            {
                UseShellExecute = true,
                Verb = "runas",
                Arguments = $"--elevated \"{reqPath}\" \"{resPath}\"",
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            using var p = Process.Start(psi)!;
            await p.WaitForExitAsync();
            _firewall = null;
            if (File.Exists(resPath))
                return JsonSerializer.Deserialize<List<SetupStep>>(await File.ReadAllTextAsync(resPath)) ?? [];
            return [new SetupStep("elevated", "Yönetici işlemi", false, "İşlem sonucu okunamadı")];
        }
        catch (Win32Exception e) when (e.NativeErrorCode == 1223)
        {
            return [new SetupStep("elevated", "Yönetici izni", false, "Yönetici izni verilmedi")];
        }
        finally
        {
            TryDelete(reqPath);
            TryDelete(resPath);
        }
    }

    private static void TryDelete(string p)
    {
        try { File.Delete(p); } catch { }
    }

    public bool Autostart
    {
        get
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(RunValue) is string v && v.Contains(Environment.ProcessPath!, StringComparison.OrdinalIgnoreCase);
        }
        set
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey);
            if (value) key.SetValue(RunValue, $"\"{Environment.ProcessPath}\" --minimized");
            else key.DeleteValue(RunValue, false);
        }
    }

    public void OpenPanelWindow() => openPanel();

    public void OpenExternal(string url) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true })?.Dispose();
}
