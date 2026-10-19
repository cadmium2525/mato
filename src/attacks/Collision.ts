import type { Impact, Vec2 } from './AttackTypes';

export type MetricMapper = (u: number, v: number) => Vec2;

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 線分 ab と点 p の最短距離 */
export function segmentPointDistance(a: Vec2, b: Vec2, p: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return distance(a, p);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y);
}

/** 円同士の重なり。距離が半径和「未満」で命中、ちょうど半径和は命中しない */
export function circlesOverlap(a: Vec2, ra: number, b: Vec2, rb: number): boolean {
  return distance(a, b) < ra + rb;
}

export function isImpactActive(impact: Impact, now: number): boolean {
  return now >= impact.impactAt && now <= impact.endAt;
}

/**
 * このステップで的に命中した着弾を探す。
 * 的は prev→curr へ移動したとみなし、線分と着弾中心の距離で判定（すり抜け防止の swept 判定）。
 */
export function findHit(
  prev: Vec2,
  curr: Vec2,
  playerRadius: number,
  impacts: readonly Impact[],
  now: number,
  toMetric: MetricMapper,
): Impact | null {
  for (const impact of impacts) {
    if (!isImpactActive(impact, now)) continue;
    const c = toMetric(impact.u, impact.v);
    if (segmentPointDistance(prev, curr, c) < playerRadius + impact.radius) return impact;
  }
  return null;
}

/**
 * ニアミス判定。攻撃(attackId)ごとに「外周リングに入った → 離れた」で1回だけ数える。
 * フレームごとの水増しを防ぐため、数えた攻撃は以後無視する。
 */
export class NearMissTracker {
  private readonly entered = new Set<number>();
  private readonly done = new Set<number>();

  constructor(private readonly ringWidth: number) {}

  reset(): void {
    this.entered.clear();
    this.done.clear();
  }

  /** このステップで成立したニアミス数を返す */
  update(player: Vec2, playerRadius: number, impacts: readonly Impact[], now: number, toMetric: MetricMapper): number {
    const inRing = new Set<number>();
    for (const impact of impacts) {
      if (!isImpactActive(impact, now) || this.done.has(impact.attackId)) continue;
      const d = distance(player, toMetric(impact.u, impact.v));
      if (d < playerRadius + impact.radius + this.ringWidth) inRing.add(impact.attackId);
    }
    for (const id of inRing) this.entered.add(id);
    let count = 0;
    for (const id of this.entered) {
      if (!inRing.has(id)) {
        this.entered.delete(id);
        this.done.add(id);
        count += 1;
      }
    }
    return count;
  }
}
