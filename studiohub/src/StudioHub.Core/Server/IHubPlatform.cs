using StudioHub.Core.Obs;

namespace StudioHub.Core.Server;

/// <summary>Yönetici izni isteyen iş: telefonların bağlanacağı TCP portları için güvenlik duvarı kuralı.</summary>
public sealed record ElevatedRequest(int[] FirewallTcp);

/// <summary>Windows kabuğunun sağladığı işler. Linux'taki geliştirme sunucusu sahte bir sürüm verir.</summary>
public interface IHubPlatform
{
    string OsName { get; }
    bool IsObsRunning();
    bool CanLaunchObs { get; }
    Task LaunchObsAsync();

    bool FirewallConfigured(HubSettings s);

    /// <summary>İstenen işleri yükseltilmiş yetkiyle çalıştırır. Kullanıcı UAC'yi reddederse adımlar başarısız döner.</summary>
    Task<IReadOnlyList<SetupStep>> RunElevatedAsync(ElevatedRequest req);

    bool Autostart { get; set; }

    /// <summary>DeckPad masaüstü penceresini açar.</summary>
    void OpenPanelWindow();

    void OpenExternal(string url);
}
