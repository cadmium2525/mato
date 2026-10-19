import { describe, expect, it } from 'vitest';
import { DifficultyDirector } from '../src/game/DifficultyDirector';

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
