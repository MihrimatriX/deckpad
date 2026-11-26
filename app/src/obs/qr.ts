/** OBS'in "Bağlantı bilgilerini göster" penceresindeki QR: obsws://IP:PORT/ŞİFRE */
export function parseObsQr(data: string): { host: string; port: number; password: string } | null {
  const m = /^obsws:\/\/([^:/\s]+):(\d+)(?:\/(.*))?$/i.exec(data.trim());
  if (!m) return null;
  let password = m[3] ?? '';
  try {
    password = decodeURIComponent(password);
  } catch {}
  return { host: m[1], port: Number(m[2]), password };
}

/**
 * DeckPad'in tanımadığı bir QR okunduğunda kullanıcıya ne yapacağını söyler.
 * Kamera aynı kodu saniyede birçok kez okur; çağıran taraf aynı metni tekrar göstermemeli.
 */
export function unknownQrHint(data: string): string {
  const t = data.trim();
  if (/^obsws:\/\//i.test(t)) return "OBS kodu eksik görünüyor. OBS › Araçlar › WebSocket Sunucu Ayarları › Bağlantı bilgilerini göster'deki QR'ı yeniden okut.";
  if (/^studiohub:\/\//i.test(t)) return "StudioHub kodu eksik görünüyor. StudioHub penceresindeki QR'ı yeniden okut.";
  if (/^https?:\/\//i.test(t)) return "Bu bir web adresi, bağlantı kodu değil. StudioHub penceresindeki QR'ı okut.";
  return "Bu QR DeckPad'e ait değil. StudioHub penceresindeki ya da OBS'in WebSocket ayarlarındaki QR'ı okut.";
}
