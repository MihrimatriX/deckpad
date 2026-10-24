using System.Drawing;
using System.Windows.Forms;
using StudioHub.Core.Webcam;
using Application = System.Windows.Application;

namespace StudioHub;

/// <summary>Bildirim alanı simgesi ve menüsü. Pencere kapalıyken StudioHub buradan yönetilir.</summary>
internal sealed class Tray : IDisposable
{
    private readonly App _app;
    private readonly NotifyIcon _icon;
    private readonly ToolStripMenuItem _webcam;
    private readonly ToolStripMenuItem _status;
    private readonly ToolStripMenuItem _topmost;

    public Tray(App app)
    {
        _app = app;
        using var stream = Application.GetResourceStream(new Uri("pack://application:,,,/Assets/studiohub.ico"))!.Stream;
        var menu = new ContextMenuStrip { ShowImageMargin = false };
        _status = new ToolStripMenuItem("…") { Enabled = false };
        _webcam = new ToolStripMenuItem("Webcam", null, async (_, _) => await _app.ToggleWebcamAsync());
        _topmost = new ToolStripMenuItem("Paneli hep üstte tut", null, (_, _) => _app.PanelTopmost = !_app.PanelTopmost);
        menu.Items.Add(_status);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("StudioHub'ı aç", null, (_, _) => _app.ShowMain()) { Font = new Font(menu.Font, FontStyle.Bold) });
        menu.Items.Add(new ToolStripMenuItem("DeckPad panelini aç", null, (_, _) => _app.ShowPanel()));
        menu.Items.Add(_topmost);
        menu.Items.Add(_webcam);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Çıkış", null, (_, _) => _app.Quit()));
        menu.Opening += (_, _) =>
        {
            Update();
            _topmost.Checked = _app.PanelTopmost;
        };
        _icon = new NotifyIcon
        {
            Icon = new Icon(stream),
            Text = "StudioHub",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _icon.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) _app.ShowMain();
        };
    }

    public void Update()
    {
        var h = _app.Host;
        var phones = h.Helper.Clients.Count;
        var cam = h.Webcam.State switch
        {
            WebcamState.Receiving => h.Webcam.Sink.HasConsumer ? "webcam yayında" : "webcam görüntü alıyor",
            WebcamState.Waiting => "webcam telefonu bekliyor",
            WebcamState.Error => "webcam hatası",
            _ => "webcam kapalı",
        };
        var text = $"{(phones == 0 ? "Bağlı cihaz yok" : $"{phones} cihaz bağlı")}, {cam}";
        _status.Text = text;
        _webcam.Text = h.Webcam.State == WebcamState.Stopped ? "Webcam alıcısını başlat" : "Webcam alıcısını durdur";
        var tip = "StudioHub: " + text;
        _icon.Text = tip.Length > 127 ? tip[..127] : tip;
    }

    public void Balloon(string title, string text) => _icon.ShowBalloonTip(4000, title, text, ToolTipIcon.None);

    public void Dispose()
    {
        _icon.Visible = false;
        _icon.Dispose();
    }
}
