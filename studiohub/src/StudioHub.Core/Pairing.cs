using System.Web;

namespace StudioHub.Core;

/// <summary>
/// Telefonların okuttuğu eşleştirme kodu. DeckPad ve CamLink aynı kodu tanır:
/// studiohub://pair?host=192.168.1.20&amp;name=PC&amp;hub=4466&amp;token=..&amp;obs=4455&amp;pass=..&amp;srt=9000&amp;webcam=9100
/// </summary>
public sealed record PairInfo(
    string Host,
    string Name,
    int HubPort,
    string Token,
    int ObsPort,
    string? ObsPassword,
    int ObsSrtPort,
    int WebcamPort)
{
    public string ToUri()
    {
        var q = HttpUtility.ParseQueryString(string.Empty);
        q["host"] = Host;
        q["name"] = Name;
        q["hub"] = HubPort.ToString();
        q["token"] = Token;
        q["obs"] = ObsPort.ToString();
        if (!string.IsNullOrEmpty(ObsPassword)) q["pass"] = ObsPassword;
        q["srt"] = ObsSrtPort.ToString();
        q["webcam"] = WebcamPort.ToString();
        return "studiohub://pair?" + q;
    }

    public static PairInfo? Parse(string uri)
    {
        if (!uri.StartsWith("studiohub://pair?", StringComparison.OrdinalIgnoreCase)) return null;
        var q = HttpUtility.ParseQueryString(uri[(uri.IndexOf('?') + 1)..]);
        var host = q["host"];
        var token = q["token"];
        if (string.IsNullOrEmpty(host) || string.IsNullOrEmpty(token)) return null;
        static int P(string? s, int d) => int.TryParse(s, out var v) ? v : d;
        return new PairInfo(host, q["name"] ?? host, P(q["hub"], 4466), token, P(q["obs"], 4455), q["pass"], P(q["srt"], 9000), P(q["webcam"], 9100));
    }

    public static PairInfo From(HubSettings s, string host) =>
        new(host, s.DeviceName, s.HubPort, s.PairToken, s.ObsWebSocketPort, s.ObsPassword, s.ObsSrtPort, s.WebcamPort);
}
