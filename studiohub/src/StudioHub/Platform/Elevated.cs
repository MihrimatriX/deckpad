using System.Diagnostics;
using System.Text.Json;
using StudioHub.Core.Obs;
using StudioHub.Core.Server;

namespace StudioHub.Platform;

/// <summary>
/// "StudioHub.exe --elevated istek.json sonuc.json" ile yönetici olarak çalışan kısa ömürlü süreç.
/// Sürücü kaydı, güvenlik duvarı kuralları ve eklenti kopyalama tek UAC onayıyla yapılır.
/// </summary>
public static class Elevated
{
    public static int Run(string requestPath, string resultPath)
    {
        var steps = new List<SetupStep>();
        try
        {
            var req = JsonSerializer.Deserialize<ElevatedRequest>(File.ReadAllText(requestPath))!;
            if (req.InstallDriver) steps.Add(InstallDriver(req.DriverName ?? "CamLink Kamera"));
            if (req.UninstallDriver) steps.Add(UninstallDriver());
            if (req.FirewallTcp != null || req.FirewallUdp != null) steps.Add(Firewall(req.FirewallTcp ?? [], req.FirewallUdp ?? []));
            if (req.PluginSource != null && req.PluginTarget != null)
            {
                try
                {
                    ObsConfigurator.CopyDir(req.PluginSource, req.PluginTarget);
                    steps.Add(new SetupStep("plugin", "CamLink OBS eklentisi", true, "Kuruldu"));
                }
                catch (Exception e)
                {
                    steps.Add(new SetupStep("plugin", "CamLink OBS eklentisi", false, e.Message));
                }
            }
        }
        catch (Exception e)
        {
            steps.Add(new SetupStep("elevated", "Yönetici işlemi", false, e.Message));
        }
        File.WriteAllText(resultPath, JsonSerializer.Serialize(steps));
        return steps.All(s => s.Ok) ? 0 : 1;
    }

    /// <summary>Sürücü kalıcı bir yere kopyalanır; böylece StudioHub klasörü taşınsa da kamera çalışır.</summary>
    private static string DriverDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "StudioHub", "driver");

    private static SetupStep InstallDriver(string name)
    {
        const string id = "driver", title = "Sanal kamera sürücüsü";
        try
        {
            var src = Path.Combine(AppContext.BaseDirectory, "driver");
            Directory.CreateDirectory(DriverDir);
            foreach (var f in Directory.GetFiles(src)) File.Copy(f, Path.Combine(DriverDir, Path.GetFileName(f)), true);

            var sys = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            var reg64 = Path.Combine(sys, "System32", "regsvr32.exe");
            var reg32 = Path.Combine(sys, "SysWOW64", "regsvr32.exe");
            var arg = $"/i:UnityCaptureName={name}";
            var c64 = Run(reg64, "/s", arg, Path.Combine(DriverDir, "UnityCaptureFilter64.dll"));
            // 32 bit uygulamalar (bazı eski Zoom/Skype sürümleri) için de kaydedilir; başarısız olursa önemli değil.
            if (File.Exists(reg32)) Run(reg32, "/s", arg, Path.Combine(DriverDir, "UnityCaptureFilter32.dll"));
            return c64 == 0
                ? new SetupStep(id, title, true, $"\"{name}\" kuruldu")
                : new SetupStep(id, title, false, $"regsvr32 hata kodu {c64}");
        }
        catch (Exception e)
        {
            return new SetupStep(id, title, false, e.Message);
        }
    }

    private static SetupStep UninstallDriver()
    {
        const string id = "driver", title = "Sanal kamera sürücüsü";
        try
        {
            var sys = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            var c = Run(Path.Combine(sys, "System32", "regsvr32.exe"), "/u", "/s", Path.Combine(DriverDir, "UnityCaptureFilter64.dll"));
            var reg32 = Path.Combine(sys, "SysWOW64", "regsvr32.exe");
            if (File.Exists(reg32)) Run(reg32, "/u", "/s", Path.Combine(DriverDir, "UnityCaptureFilter32.dll"));
            return c == 0 ? new SetupStep(id, title, true, "Kaldırıldı") : new SetupStep(id, title, false, $"regsvr32 hata kodu {c}");
        }
        catch (Exception e)
        {
            return new SetupStep(id, title, false, e.Message);
        }
    }

    /// <summary>
    /// Kurallar yalnızca aynı yerel ağdan gelen bağlantılara izin verir. Wi‑Fi "Ortak" olarak
    /// işaretli olsa da telefonlar bağlanabilsin diye tüm profillerde geçerlidir.
    /// </summary>
    private static SetupStep Firewall(int[] tcp, int[] udp)
    {
        const string id = "firewall", title = "Güvenlik duvarı";
        try
        {
            var errors = new List<string>();
            void Rule(string name, string proto, int[] ports)
            {
                if (ports.Length == 0) return;
                Run("netsh", "advfirewall", "firewall", "delete", "rule", $"name={name}");
                var code = Run("netsh", "advfirewall", "firewall", "add", "rule", $"name={name}", "dir=in", "action=allow",
                    $"protocol={proto}", $"localport={string.Join(",", ports.Distinct())}", "remoteip=localsubnet", "profile=any");
                if (code != 0) errors.Add($"{name}: netsh {code}");
            }
            Rule("StudioHub (TCP)", "TCP", tcp);
            Rule("StudioHub (UDP)", "UDP", udp);
            return errors.Count == 0 ? new SetupStep(id, title, true, "İzinler eklendi") : new SetupStep(id, title, false, string.Join(", ", errors));
        }
        catch (Exception e)
        {
            return new SetupStep(id, title, false, e.Message);
        }
    }

    private static int Run(string exe, params string[] args)
    {
        var psi = new ProcessStartInfo(exe) { CreateNoWindow = true, UseShellExecute = false };
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var p = Process.Start(psi)!;
        p.WaitForExit(30000);
        return p.ExitCode;
    }
}
