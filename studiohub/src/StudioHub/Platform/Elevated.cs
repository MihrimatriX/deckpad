using System.Diagnostics;
using System.Text.Json;
using StudioHub.Core.Obs;
using StudioHub.Core.Server;

namespace StudioHub.Platform;

/// <summary>
/// "StudioHub.exe --elevated istek.json sonuc.json" ile yönetici olarak çalışan kısa ömürlü süreç.
/// Telefonların bağlanabilmesi için güvenlik duvarı kuralını ekler.
/// </summary>
public static class Elevated
{
    public static int Run(string requestPath, string resultPath)
    {
        var steps = new List<SetupStep>();
        try
        {
            var req = JsonSerializer.Deserialize<ElevatedRequest>(File.ReadAllText(requestPath))!;
            steps.Add(Firewall(req.FirewallTcp));
        }
        catch (Exception e)
        {
            steps.Add(new SetupStep("elevated", "Yönetici işlemi", false, e.Message));
        }
        File.WriteAllText(resultPath, JsonSerializer.Serialize(steps));
        return steps.All(s => s.Ok) ? 0 : 1;
    }

    /// <summary>
    /// Kural yalnızca aynı yerel ağdan gelen bağlantılara izin verir. Wi‑Fi "Ortak" olarak
    /// işaretli olsa da telefonlar bağlanabilsin diye tüm profillerde geçerlidir.
    /// </summary>
    private static SetupStep Firewall(int[] tcp)
    {
        const string id = "firewall", title = "Güvenlik duvarı", name = "StudioHub (TCP)";
        try
        {
            // Eski sürümlerin webcam için açtığı UDP kuralı artık gerekmiyor.
            Run("netsh", "advfirewall", "firewall", "delete", "rule", "name=StudioHub (UDP)");
            Run("netsh", "advfirewall", "firewall", "delete", "rule", $"name={name}");
            var code = Run("netsh", "advfirewall", "firewall", "add", "rule", $"name={name}", "dir=in", "action=allow",
                "protocol=TCP", $"localport={string.Join(",", tcp.Distinct())}", "remoteip=localsubnet", "profile=any");
            return code == 0 ? new SetupStep(id, title, true, "İzinler eklendi") : new SetupStep(id, title, false, $"{name}: netsh {code}");
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
