import Constants from 'expo-constants';

/** StudioHub'da görünen ad: telefonun kendi adı, yoksa "DeckPad". */
export function deviceName(): string {
  const n = Constants.deviceName;
  return n && n.length <= 40 ? n : 'DeckPad';
}
