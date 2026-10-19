import { describe, expect, it } from 'vitest';
import type { Impact } from '../src/attacks/AttackTypes';
import { NearMissTracker, circlesOverlap, findHit, segmentPointDistance } from '../src/attacks/Collision';

const identity = (u: number, v: number) => ({ x: u, y: v });

function impact(partial: Partial<Impact> & { u: number; v: number }): Impact {
  return { id: 1, attackId: 1, radius: 0.02, spawnAt: 0, impactAt: 0, endAt: 1, ...partial };
}

describe('circlesOverlap', () => {
  it('距離が半径和より小さいと命中', () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 0.03, { x: 0.049, y: 0 }, 0.02)).toBe(true);
  });
  it('距離がちょうど半径和、またはそれ以上なら命中しない', () => {
    expect(circlesOverlap({ x: 0, y: 0 }, 0.25, { x: 0.5, y: 0 }, 0.25)).toBe(false);
    expect(circlesOverlap({ x: 0, y: 0 }, 0.03, { x: 0.06, y: 0 }, 0.02)).toBe(false);
  });
});

describe('findHit', () => {
  it('着弾時刻前・判定終了後は命中しない', () => {
    const imp = impact({ u: 0, v: 0, impactAt: 1, endAt: 1.1 });
    const p = { x: 0, y: 0 };
    expect(findHit(p, p, 0.03, [imp], 0.99, identity)).toBeNull();
    expect(findHit(p, p, 0.03, [imp], 1.05, identity)).toBe(imp);
    expect(findHit(p, p, 0.03, [imp], 1.11, identity)).toBeNull();
  });

  it('高速移動で着弾を飛び越えても swept 判定で命中する', () => {
    const imp = impact({ u: 0.5, v: 0 });
    const hit = findHit({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.01, [imp], 0.5, identity);
    expect(hit).toBe(imp);
  });

  it('メトリック変換を通して縦横の実寸比を考慮する', () => {
    // u は 0.4m、v は 0.2m の領域
    const metric = (u: number, v: number) => ({ x: u * 0.4, y: v * 0.2 });
    const imp = impact({ u: 0.5, v: 0.5, radius: 0.01 });
    // u 方向に 0.1 (=0.04m) 離れる → 半径和 0.03m 超え → 命中しない
    expect(findHit(metric(0.6, 0.5), metric(0.6, 0.5), 0.02, [imp], 0.5, metric)).toBeNull();
    // v 方向に 0.1 (=0.02m) 離れる → 命中
    expect(findHit(metric(0.5, 0.6), metric(0.5, 0.6), 0.02, [imp], 0.5, metric)).toBe(imp);
  });
});

describe('segmentPointDistance', () => {
  it('線分外の点は端点からの距離', () => {
    expect(segmentPointDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(1);
    expect(segmentPointDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 0.3 })).toBeCloseTo(0.3);
  });
});

describe('NearMissTracker', () => {
  it('1攻撃の接近通過につき1回だけ数える', () => {
    const t = new NearMissTracker(0.03);
    const imps = [impact({ id: 1, attackId: 7, u: 0, v: 0 }), impact({ id: 2, attackId: 7, u: 0.005, v: 0 })];
    let total = 0;
    // 外 → リング内に何フレームも滞在 → 外
    const xs = [0.2, 0.07, 0.065, 0.06, 0.07, 0.2, 0.07, 0.2];
    xs.forEach((x, i) => {
      total += t.update({ x, y: 0 }, 0.02, imps, 0.1 + i * 0.01, identity);
    });
    expect(total).toBe(1);
  });

  it('別の攻撃なら別々に数える', () => {
    const t = new NearMissTracker(0.03);
    const a = impact({ id: 1, attackId: 1, u: 0, v: 0 });
    const b = impact({ id: 2, attackId: 2, u: 1, v: 0 });
    let total = 0;
    total += t.update({ x: 0.06, y: 0 }, 0.02, [a, b], 0.1, identity);
    total += t.update({ x: 0.5, y: 0 }, 0.02, [a, b], 0.2, identity);
    total += t.update({ x: 0.94, y: 0 }, 0.02, [a, b], 0.3, identity);
    total += t.update({ x: 0.5, y: 0 }, 0.02, [a, b], 0.4, identity);
    expect(total).toBe(2);
  });

  it('リングに入らなければ数えない', () => {
    const t = new NearMissTracker(0.03);
    const a = impact({ u: 0, v: 0 });
    expect(t.update({ x: 0.2, y: 0 }, 0.02, [a], 0.1, identity)).toBe(0);
    expect(t.update({ x: 0.3, y: 0 }, 0.02, [a], 0.2, identity)).toBe(0);
  });
});
