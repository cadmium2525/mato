import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/game/GameConfig';
import { RoundDirector } from '../src/game/RoundDirector';
import { SettingsStore, defaultSettings } from '../src/game/Settings';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('SettingsStore', () => {
  it('保存した設定を読み戻せる', () => {
    const mem = new MemoryStorage();
    const store = new SettingsStore(() => mem as unknown as Storage);
    const d = defaultSettings(false);
    expect(store.load(d)).toEqual(d);
    store.save({ ...d, sound: false, quality: 'low', shortCinematics: true, tutorialSeen: true });
    expect(store.load(d)).toEqual({ sound: false, quality: 'low', shortCinematics: true, tutorialSeen: true });
  });

  it('既定の画質はPCで高、スマホで中', () => {
    expect(defaultSettings(false).quality).toBe('high');
    expect(defaultSettings(true).quality).toBe('medium');
  });

  it('壊れた値・不正な値は既定値にする', () => {
    const mem = new MemoryStorage();
    mem.setItem('mato.settings.v1', JSON.stringify({ sound: 'yes', quality: 'ultra' }));
    const store = new SettingsStore(() => mem as unknown as Storage);
    expect(store.load(defaultSettings(false))).toEqual(defaultSettings(false));
    mem.setItem('mato.settings.v1', '{broken');
    expect(store.load(defaultSettings(true))).toEqual(defaultSettings(true));
  });

  it('localStorage が使えなくても落ちない', () => {
    const store = new SettingsStore(() => {
      throw new Error('SecurityError');
    });
    expect(store.load(defaultSettings(false))).toEqual(defaultSettings(false));
    expect(store.save(defaultSettings(false))).toBe(false);
  });

  it('画質プリセットは高→低で負荷が下がる', () => {
    const { high, medium, low } = GameConfig.quality;
    expect(high.pixelRatio).toBeGreaterThan(medium.pixelRatio);
    expect(medium.pixelRatio).toBeGreaterThan(low.pixelRatio);
    expect(low.shadows).toBe(false);
  });
});

describe('演出短縮', () => {
  it('初回でも導入を省略し、行列パンとクリア演出を短くする', () => {
    const d = new RoundDirector();
    d.setShortCinematics(true);
    d.startGame(1);
    expect(d.phase).toBe('QUEUE_PAN');
    expect(d.queuePanSeconds).toBe(GameConfig.timing.queuePanRetry);
    expect(d.roundClearSeconds).toBeLessThan(GameConfig.timing.roundClear);
  });

  it('通常設定では初回に導入がある', () => {
    const d = new RoundDirector();
    d.startGame(1);
    expect(d.phase).toBe('INTRO');
    expect(d.roundClearSeconds).toBe(GameConfig.timing.roundClear);
  });
});
