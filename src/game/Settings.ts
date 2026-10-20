export type Quality = 'high' | 'medium' | 'low';

export interface Settings {
  sound: boolean;
  quality: Quality;
  /** 演出を短縮する（導入を省略・行列パンを短く） */
  shortCinematics: boolean;
  /** 初回のヒントを見たか */
  tutorialSeen: boolean;
}

const KEY = 'mato.settings.v1';
const QUALITIES: readonly Quality[] = ['high', 'medium', 'low'];

export function defaultSettings(touch: boolean): Settings {
  return { sound: true, quality: touch ? 'medium' : 'high', shortCinematics: false, tutorialSeen: false };
}

/** localStorage に設定を保存する。使えない環境でも既定値で続行する */
export class SettingsStore {
  constructor(private readonly getStorage: () => Storage | null = defaultStorage) {}

  load(defaults: Settings): Settings {
    try {
      const raw = this.getStorage()?.getItem(KEY);
      if (!raw) return { ...defaults };
      const d = JSON.parse(raw) as Partial<Settings>;
      return {
        sound: typeof d.sound === 'boolean' ? d.sound : defaults.sound,
        quality: QUALITIES.includes(d.quality as Quality) ? (d.quality as Quality) : defaults.quality,
        shortCinematics: typeof d.shortCinematics === 'boolean' ? d.shortCinematics : defaults.shortCinematics,
        tutorialSeen: typeof d.tutorialSeen === 'boolean' ? d.tutorialSeen : defaults.tutorialSeen,
      };
    } catch {
      return { ...defaults };
    }
  }

  save(s: Settings): boolean {
    try {
      const storage = this.getStorage();
      if (!storage) return false;
      storage.setItem(KEY, JSON.stringify(s));
      return true;
    } catch {
      return false;
    }
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
