import { describe, expect, it } from 'vitest';
import { AttackDirector, type RoundAttackOptions } from '../src/attacks/AttackDirector';
import type { AttackKind, Impact } from '../src/attacks/AttackTypes';
import { ENEMY_KINDS, getProfile, type EnemyKind } from '../src/entities/EnemyProfiles';
import { TargetPlayer } from '../src/entities/TargetPlayer';
import { GameConfig } from '../src/game/GameConfig';
import { SeededRandom } from '../src/game/SeededRandom';
import { UrinalSurface } from '../src/scene/UrinalSurface';

const surface = new UrinalSurface();
const player = new TargetPlayer(surface);
const toUV = (x: number, y: number) => surface.fromMetric(x, y);
const toM = (i: Impact) => surface.toMetricUV(i.u, i.v);
const STEP = 1 / 120;
const SHOTS_PER_STEP = (t: number) => (Math.round(t * 120) % 2 === 0 ? 1 : 0); // 60Hz 相当

function director(kind: AttackKind, enemy: EnemyKind = 'salaryman', seed = 1, extra: Partial<RoundAttackOptions> = {}) {
  const profile = getProfile(enemy);
  const d = new AttackDirector(GameConfig.attack);
  d.beginRound({
    kind,
    profile,
    rng: new SeededRandom(seed),
    fireIntervalMultiplier: 1,
    pelletCount: 6,
    startAt: profile.windupSeconds,
    endAt: profile.windupSeconds + profile.durationSeconds,
    ...extra,
  });
  return { d, profile };
}

/** 照準を中央に固定して1ラウンド分回し、生成された Impact を時刻つきで返す */
function runAll(kind: AttackKind, enemy: EnemyKind = 'salaryman', seed = 1, extra: Partial<RoundAttackOptions> = {}) {
  const { d, profile } = director(kind, enemy, seed, extra);
  const aim = { x: surface.widthM / 2, y: surface.heightM / 2 };
  const all: Array<{ createdAt: number; impact: Impact; pattern: string }> = [];
  for (let t = STEP; t < profile.windupSeconds + profile.durationSeconds + 1; t += STEP) {
    const streaming = t >= profile.windupSeconds && t < profile.windupSeconds + profile.durationSeconds;
    const out = d.update({ now: t, shots: streaming ? SHOTS_PER_STEP(t) : 0, streaming, aim, toUV });
    for (const impact of out) all.push({ createdAt: t, impact, pattern: d.pattern });
  }
  return { all, d, profile };
}

describe('2WAY', () => {
  it('左右2本に分かれ、内側の空きは的の判定直径より十分広い（全キャラ）', () => {
    for (const kind of ENEMY_KINDS) {
      const { all } = runAll('twoWay', kind);
      const streams = all.filter((a) => a.impact.kind === 'stream');
      const t0 = streams[0].impact.spawnAt;
      const pair = streams.filter((a) => a.impact.spawnAt === t0).map((a) => toM(a.impact));
      expect(pair).toHaveLength(2);
      const r = getProfile(kind).impactRadius;
      const clear = Math.abs(pair[0].x - pair[1].x) - 2 * r;
      expect(clear).toBeCloseTo(GameConfig.attack.twoWayClear, 6);
      expect(clear).toBeGreaterThan(player.hitRadius * 2 * 1.8);
      expect(pair[0].y).toBeCloseTo(pair[1].y, 9);
    }
  });
});

describe('3WAY', () => {
  it('中央＋左右下の3本。照準と同じ高さを横へ逃げる道が空いている（全キャラ）', () => {
    for (const kind of ENEMY_KINDS) {
      const { d } = director('threeWay', kind);
      const offsets = d.offsets('threeWay');
      expect(offsets).toHaveLength(3);
      const r = getProfile(kind).impactRadius;
      const sides = offsets.filter((o) => o.x !== 0);
      for (const o of sides) {
        // 横移動（y=0）の的が左右の流れに触れない
        expect(Math.abs(o.y)).toBeGreaterThan(r + player.hitRadius);
        // 中央と左右の間を的が通り抜けられる
        expect(Math.hypot(o.x, o.y) - 2 * r).toBeGreaterThan(player.hitRadius * 2);
      }
    }
  });
});

describe('ショットガン', () => {
  it('粒数は指定どおり（5〜7）で、各粒は独立した判定を持つ', () => {
    for (const n of [5, 6, 7]) {
      const { all } = runAll('shotgun', 'salaryman', 3, { pelletCount: n });
      const pellets = all.filter((a) => a.impact.kind === 'pellet');
      const firstVolley = pellets.filter((a) => a.impact.attackId === pellets[0].impact.attackId);
      expect(firstVolley).toHaveLength(n);
      expect(new Set(firstVolley.map((a) => a.impact.id)).size).toBe(n);
    }
  });

  it('着弾位置は予告の時点で確定し、予告→発射→着弾まで十分な時間がある', () => {
    const { all, profile } = runAll('shotgun');
    const cfg = GameConfig.attack.shotgun;
    for (const { createdAt, impact } of all.filter((a) => a.impact.kind === 'pellet')) {
      expect(impact.warnAt).toBeCloseTo(createdAt, 9);
      expect(impact.spawnAt - impact.warnAt!).toBeCloseTo(cfg.telegraph, 9);
      expect(impact.impactAt - impact.warnAt!).toBeCloseTo(cfg.telegraph + profile.timeToImpact, 9);
      expect(impact.impactAt - impact.warnAt!).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('扇の要（照準）から一定範囲に収まり、要そのものには置かない', () => {
    const { all } = runAll('shotgun');
    const center = { x: surface.widthM / 2, y: surface.heightM / 2 };
    for (const { impact } of all.filter((a) => a.impact.kind === 'pellet')) {
      const d = Math.hypot(toM(impact).x - center.x, toM(impact).y - center.y);
      expect(d).toBeGreaterThanOrEqual(GameConfig.attack.shotgun.minDist - 1e-9);
      expect(d).toBeLessThanOrEqual(GameConfig.attack.shotgun.maxDist + 1e-9);
    }
  });

  it('同じシードなら散布は同じ、違うシードなら違う', () => {
    const pos = (seed: number) => runAll('shotgun', 'salaryman', seed).all.map((a) => `${a.impact.u.toFixed(5)},${a.impact.v.toFixed(5)}`).join('|');
    expect(pos(5)).toBe(pos(5));
    expect(pos(5)).not.toBe(pos(6));
  });

  it('一斉射撃どうしが同時に着弾しない', () => {
    const { all } = runAll('shotgun', 'salaryman', 1, { fireIntervalMultiplier: 0.75 });
    const volleys = new Map<number, number>();
    for (const { impact } of all) if (impact.kind === 'pellet') volleys.set(impact.attackId, impact.impactAt);
    const times = [...volleys.values()].sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(GameConfig.attack.shotgun.lifetime);
  });
});

describe('コンボ', () => {
  it('区間の間には必ず休止が入り、攻撃が時間的に重ならない', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { d, profile } = director('combo', 'salaryman', seed);
      const segs = d.segments;
      expect(segs.length).toBeGreaterThanOrEqual(3);
      expect(segs[0].from).toBeCloseTo(profile.windupSeconds);
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i].from).toBeCloseTo(segs[i - 1].to, 9);
        // 攻撃区間が連続しない（間に gap）
        if (segs[i].pattern !== 'gap') expect(segs[i - 1].pattern).toBe('gap');
      }
      // 最後の休止だけはラウンド終了で切れることがある
      for (const s of segs.slice(0, -1)) if (s.pattern === 'gap') expect(s.to - s.from).toBeCloseTo(GameConfig.attack.combo.gap, 6);
      // 少なくとも2種類の攻撃を組み合わせる
      expect(new Set(segs.filter((s) => s.pattern !== 'gap').map((s) => s.pattern)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('前の区間の着弾は、次の区間の最初の着弾より前に判定を終える', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { all, d } = runAll('combo', 'salaryman', seed);
      const segOf = (t: number) => d.segments.findIndex((s) => t >= s.from && t < s.to);
      const bySeg = new Map<number, Impact[]>();
      for (const { createdAt, impact } of all) {
        const k = segOf(createdAt);
        if (!bySeg.has(k)) bySeg.set(k, []);
        bySeg.get(k)!.push(impact);
      }
      const keys = [...bySeg.keys()].sort((a, b) => a - b);
      for (let i = 1; i < keys.length; i++) {
        const prevEnd = Math.max(...bySeg.get(keys[i - 1])!.map((x) => x.endAt));
        const nextStart = Math.min(...bySeg.get(keys[i])!.map((x) => x.impactAt));
        expect(prevEnd, `seed ${seed}`).toBeLessThan(nextStart);
      }
    }
  });

  it('休止中は新しい尿流を出さない', () => {
    const { all } = runAll('combo', 'salaryman', 2);
    expect(all.filter((a) => a.pattern === 'gap' && a.impact.kind === 'stream')).toHaveLength(0);
  });
});

describe('マッチョの跳ね返り', () => {
  it('一次着弾の瞬間に予兆が出て、十分な時間の後に二次着弾する', () => {
    const { all, profile } = runAll('single', 'muscle');
    const byId = new Map(all.map((a) => [a.impact.id, a.impact]));
    const bounces = all.filter((a) => a.impact.kind === 'bounce').map((a) => a.impact);
    expect(bounces.length).toBeGreaterThan(5);
    for (const b of bounces) {
      expect(b.fromU).toBeDefined();
      const primary = [...byId.values()].find(
        (p) => p.kind !== 'bounce' && p.u === b.fromU && p.v === b.fromV && Math.abs(p.impactAt - b.warnAt!) < 1e-9,
      )!;
      expect(primary).toBeDefined();
      expect(b.warnAt).toBeCloseTo(primary.impactAt, 9);
      expect(b.impactAt - b.warnAt!).toBeCloseTo(profile.bounce.delay, 9);
      expect(b.impactAt - b.warnAt!).toBeGreaterThanOrEqual(0.25);
      // 一次着弾より下に跳ねる
      expect(toM(b).y).toBeLessThan(toM(primary).y);
    }
  });

  it('マッチョ以外は跳ね返らない', () => {
    for (const kind of ENEMY_KINDS.filter((k) => k !== 'muscle')) {
      expect(runAll('single', kind).all.some((a) => a.impact.kind === 'bounce')).toBe(false);
    }
  });
});
