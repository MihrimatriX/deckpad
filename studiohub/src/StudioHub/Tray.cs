using System.Drawing;
using System.Windows.Forms;
using Application = System.Windows.Application;

namespace StudioHub;

/// <summary>Bildirim alanı simgesi ve menüsü. Pencere kapalıyken StudioHub buradan yönetilir.</summary>
internal sealed class Tray : IDisposable
{
    private readonly App _app;
    private readonly NotifyIcon _icon;
    private readonly ToolStripMenuItem _status;
    private readonly ToolStripMenuItem _topmost;

    public Tray(App app)
    {
        _app = app;
        using var stream = Application.GetResourceStream(new Uri("pack://application:,,,/Assets/studiohub.ico"))!.Stream;
        var menu = new ContextMenuStrip { ShowImageMargin = false };
        _status = new ToolStripMenuItem("…") { Enabled = false };
        _topmost = new ToolStripMenuItem("Paneli hep üstte tut", null, (_, _) => _app.PanelTopmost = !_app.PanelTopmost);
        menu.Items.Add(_status);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("StudioHub'ı aç", null, (_, _) => _app.ShowMain()) { Font = new Font(menu.Font, FontStyle.Bold) });
        menu.Items.Add(new ToolStripMenuItem("DeckPad panelini aç", null, (_, _) => _app.ShowPanel()));
        menu.Items.Add(_topmost);
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
        var phones = _app.Host.Helper.Clients.Count;
        var text = phones == 0 ? "Bağlı cihaz yok" : $"{phones} cihaz bağlı";
        _status.Text = text;
        _icon.Text = "StudioHub: " + text;
    }

    public void Balloon(string title, string text) => _icon.ShowBalloonTip(4000, title, text, ToolTipIcon.None);

    public void Dispose()
    {
        _icon.Visible = false;
        _icon.Dispose();
    }
}
