import { describe, expect, it } from 'vitest';
import type { AttackKind } from '../src/attacks/AttackTypes';
import { DifficultyDirector } from '../src/game/DifficultyDirector';
import { SeededRandom } from '../src/game/SeededRandom';

const d = new DifficultyDirector();

describe('DifficultyDirector', () => {
  it('1〜3人目は single のみ', () => {
    for (const n of [1, 2, 3]) expect(d.forEnemy(n).attacks).toEqual(['single']);
  });
  it('4人目で twoWay 解禁', () => {
    expect(d.forEnemy(3).attacks).not.toContain('twoWay');
    expect(d.forEnemy(4).attacks).toContain('twoWay');
  });
  it('8人目で threeWay 解禁', () => {
    expect(d.forEnemy(7).attacks).not.toContain('threeWay');
    expect(d.forEnemy(8).attacks).toContain('threeWay');
  });
  it('13人目で shotgun 解禁', () => {
    expect(d.forEnemy(12).attacks).not.toContain('shotgun');
    expect(d.forEnemy(13).attacks).toContain('shotgun');
  });
  it('18人目で combo 解禁', () => {
    expect(d.forEnemy(17).attacks).not.toContain('combo');
    expect(d.forEnemy(18).attacks).toContain('combo');
    expect(d.forEnemy(100).attacks).toContain('combo');
  });
  it('追尾倍率は単調増加し上限がある', () => {
    let prev = 0;
    for (let n = 1; n < 60; n++) {
      const m = d.forEnemy(n).trackingMultiplier;
      expect(m).toBeGreaterThanOrEqual(prev);
      expect(m).toBeLessThanOrEqual(1.35);
      prev = m;
    }
  });
});

describe('chooseAttack', () => {
  it('解禁された人数で、その攻撃が初めて必ず出る', () => {
    const rng = new SeededRandom(1);
    const used = new Set<AttackKind>();
    const picks: AttackKind[] = [];
    for (let n = 1; n <= 20; n++) {
      const k = d.chooseAttack(n, rng, used);
      used.add(k);
      picks.push(k);
    }
    expect(picks.slice(0, 3)).toEqual(['single', 'single', 'single']);
    expect(picks[3]).toBe('twoWay');
    expect(picks[7]).toBe('threeWay');
    expect(picks[12]).toBe('shotgun');
    expect(picks[17]).toBe('combo');
    // 解禁前の攻撃は出ない
    expect(picks.slice(0, 12)).not.toContain('shotgun');
    expect(picks.slice(0, 17)).not.toContain('combo');
  });

  it('解禁済みの攻撃が混ざって出る（最新だけにならない）', () => {
    const rng = new SeededRandom(9);
    const used = new Set<AttackKind>(['single', 'twoWay', 'threeWay', 'shotgun', 'combo']);
    const counts = new Map<AttackKind, number>();
    for (let i = 0; i < 400; i++) {
      const k = d.chooseAttack(25, rng, used);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(5);
    expect(counts.get('combo')!).toBeGreaterThan(100);
  });

  it('ショットガンの粒数は5〜7', () => {
    for (let n = 1; n < 60; n++) {
      const c = d.forEnemy(n).pelletCount;
      expect(c).toBeGreaterThanOrEqual(5);
      expect(c).toBeLessThanOrEqual(7);
    }
    expect(d.forEnemy(13).pelletCount).toBe(5);
    expect(d.forEnemy(30).pelletCount).toBe(7);
  });
});
