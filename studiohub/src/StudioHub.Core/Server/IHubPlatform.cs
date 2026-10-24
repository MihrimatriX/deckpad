using StudioHub.Core.Obs;

namespace StudioHub.Core.Server;

/// <summary>Yönetici izni isteyen işler tek bir UAC onayıyla birlikte yapılır.</summary>
public sealed record ElevatedRequest(
    bool InstallDriver = false,
    bool UninstallDriver = false,
    string? DriverName = null,
    int[]? FirewallTcp = null,
    int[]? FirewallUdp = null,
    string? PluginSource = null,
    string? PluginTarget = null);

/// <summary>Windows kabuğunun sağladığı işler. Linux'taki geliştirme sunucusu sahte bir sürüm verir.</summary>
public interface IHubPlatform
{
    string OsName { get; }
    bool IsObsRunning();
    bool CanLaunchObs { get; }
    Task LaunchObsAsync();

    /// <summary>Kurulu sanal kamera sürücüsü var mı.</summary>
    bool DriverInstalled { get; }

    bool FirewallConfigured(HubSettings s);

    /// <summary>İstenen işleri yükseltilmiş yetkiyle çalıştırır. Kullanıcı UAC'yi reddederse adımlar başarısız döner.</summary>
    Task<IReadOnlyList<SetupStep>> RunElevatedAsync(ElevatedRequest req);

    bool Autostart { get; set; }

    /// <summary>DeckPad masaüstü penceresini açar.</summary>
    void OpenPanelWindow();

    void OpenExternal(string url);
}
