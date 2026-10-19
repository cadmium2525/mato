import { describe, expect, it } from 'vitest';
import { BestStore, ScoreManager, isBetterRecord } from '../src/game/ScoreManager';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.get(k) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

const throwing = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('quota'); },
} as unknown as Storage;

describe('BestStore', () => {
  it('保存と読み込み', () => {
    const s = new BestStore(() => new MemoryStorage());
    const mem = new MemoryStorage();
    const store = new BestStore(() => mem);
    expect(store.load()).toBeNull();
    expect(store.submit({ cleared: 3, score: 100, survivalTime: 20, seed: 1 }).isNewBest).toBe(true);
    expect(store.load()?.cleared).toBe(3);
    expect(store.submit({ cleared: 2, score: 9999, survivalTime: 99, seed: 2 }).isNewBest).toBe(false);
    expect(store.load()?.cleared).toBe(3);
    expect(s.load()).toBeNull();
  });

  it('localStorage が例外を投げてもクラッシュしない', () => {
    const store = new BestStore(() => throwing);
    expect(store.load()).toBeNull();
    expect(store.save({ cleared: 1, score: 1, survivalTime: 1, seed: 1 })).toBe(false);
    expect(() => store.submit({ cleared: 1, score: 1, survivalTime: 1, seed: 1 })).not.toThrow();
  });

  it('storage が取得できない環境でもクラッシュしない', () => {
    const store = new BestStore(() => {
      throw new Error('SecurityError');
    });
    expect(store.load()).toBeNull();
    expect(store.save({ cleared: 1, score: 1, survivalTime: 1, seed: 1 })).toBe(false);
  });

  it('壊れたJSONは無視する', () => {
    const mem = new MemoryStorage();
    mem.setItem('mato.best.v1', '{broken');
    expect(new BestStore(() => mem).load()).toBeNull();
  });
});

describe('isBetterRecord', () => {
  it('人数 → スコア → 生存時間 の順で比較', () => {
    const base = { cleared: 5, score: 1000, survivalTime: 40, seed: 0 };
    expect(isBetterRecord({ ...base, cleared: 6, score: 0 }, base)).toBe(true);
    expect(isBetterRecord({ ...base, score: 1001 }, base)).toBe(true);
    expect(isBetterRecord({ ...base, survivalTime: 41 }, base)).toBe(true);
    expect(isBetterRecord(base, base)).toBe(false);
    expect(isBetterRecord({ ...base, cleared: 4, score: 99999 }, base)).toBe(false);
  });
});

describe('ScoreManager', () => {
  it('生存時間・ニアミス・連続ニアミス・ラウンドクリアで加点', () => {
    const s = new ScoreManager({ perSecond: 10, nearMiss: 100, nearMissStreak3: 300, roundClear: 500 }, 1.5);
    s.addSurvival(2);
    expect(s.score).toBe(20);
    s.addNearMiss(1);
    s.addNearMiss(2);
    s.addNearMiss(3);
    expect(s.nearMisses).toBe(3);
    expect(s.score).toBe(20 + 300 + 300);
    s.roundCleared();
    expect(s.score).toBe(20 + 600 + 500);
    s.reset();
    expect(s.score).toBe(0);
  });
});
