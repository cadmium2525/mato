import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../src/attacks/AttackTypes';
import { ENEMY_KINDS, getProfile, type EnemyKind } from '../src/entities/EnemyProfiles';
import { GameConfig } from '../src/game/GameConfig';
import { RoundSimulation } from '../src/game/RoundSimulation';
import { SeededRandom } from '../src/game/SeededRandom';
import { normalizeMove } from '../src/input/InputManager';
import { UrinalSurface } from '../src/scene/UrinalSurface';

const surface = new UrinalSurface();
const STEP = GameConfig.simulation.fixedStep;

type Bot = (sim: RoundSimulation) => Vec2;

function runRound(kind: EnemyKind, seed: number, bot: Bot, trackingMultiplier = 1) {
  const sim = new RoundSimulation(surface);
  sim.begin(getProfile(kind), 'single', trackingMultiplier, new SeededRandom(seed));
  let nearMisses = 0;
  for (let i = 0; i < 120 * 30; i++) {
    const r = sim.step(STEP, bot(sim));
    nearMisses += r.nearMisses;
    if (r.hit) return { outcome: 'hit' as const, time: sim.time, nearMisses };
    if (r.finished) return { outcome: 'cleared' as const, time: sim.time, nearMisses };
  }
  return { outcome: 'timeout' as const, time: sim.time, nearMisses };
}

const idle: Bot = () => ({ x: 0, y: 0 });

/**
 * 人間のプレイの代用ボット。見えている情報（照準リングと飛行中の尿粒の着弾先）だけを使い、
 * 8方向＋停止の中から、少し先の位置で危険から最も遠くなる方向を選ぶ。
 */
function evasiveBot(): Bot {
  const dirs: Vec2[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < 8; i++) dirs.push(normalizeMove(Math.round(Math.cos((i * Math.PI) / 4)), Math.round(Math.sin((i * Math.PI) / 4))));
  return (sim) => {
    const p = sim.player.position;
    const aim = sim.enemy!.aim;
    const lookahead = 0.12;
    const dangers = sim.impacts
      .filter((i) => i.endAt >= sim.time)
      .map((i) => surface.toMetricUV(i.u, i.v));
    let best = dirs[0];
    let bestScore = -Infinity;
    for (const d of dirs) {
      const q = surface.clampMetric(
        { x: p.x + d.x * sim.player.speed * lookahead, y: p.y + d.y * sim.player.speed * lookahead },
        sim.player.visualRadius,
      );
      let minD = Math.hypot(q.x - aim.x, q.y - aim.y) * 0.8;
      for (const c of dangers) minD = Math.min(minD, Math.hypot(q.x - c.x, q.y - c.y));
      // 壁際に追い詰められないよう中央寄りを少し好む
      const center = Math.hypot(q.x - surface.widthM / 2, q.y - surface.heightM / 2);
      const score = Math.min(minD, 0.2) - center * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  };
}

describe('RoundSimulation', () => {
  it('動かない的にはいずれ命中する', () => {
    for (const kind of ENEMY_KINDS) {
      const r = runRound(kind, 1, idle);
      expect(r.outcome).toBe('hit');
      // 予備動作中や開始直後には当たらない（照準は反対側から来る）
      expect(r.time).toBeGreaterThan(getProfile(kind).windupSeconds + getProfile(kind).timeToImpact);
    }
  });

  it('逃げ続ければ全キャラ1人分を生き延びられる（回避経路が存在する）', () => {
    for (const kind of ENEMY_KINDS) {
      let cleared = 0;
      const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
      for (const seed of seeds) {
        const r = runRound(kind, seed, evasiveBot());
        if (r.outcome === 'cleared') {
          cleared += 1;
          const p = getProfile(kind);
          // 排尿時間 + 予備動作 + 最後の着弾の判定が終わるまで
          expect(r.time).toBeGreaterThanOrEqual(p.windupSeconds + p.durationSeconds);
          expect(r.time).toBeLessThan(p.windupSeconds + p.durationSeconds + p.timeToImpact + 0.3);
        }
      }
      expect(cleared, `${kind}: cleared ${cleared}/${seeds.length}`).toBeGreaterThanOrEqual(seeds.length - 1);
    }
  });

  it('clear で前ラウンドの着弾を引き継がない', () => {
    const sim = new RoundSimulation(surface);
    sim.begin(getProfile('salaryman'), 'single', 1, new SeededRandom(3));
    for (let i = 0; i < 240; i++) sim.step(STEP, { x: 1, y: 0 });
    expect(sim.impacts.length).toBeGreaterThan(0);
    sim.begin(getProfile('drunk'), 'single', 1, new SeededRandom(4));
    expect(sim.impacts).toHaveLength(0);
    expect(sim.time).toBe(0);
  });

  it('同じシード・同じ入力なら同じ結果（再現性）', () => {
    const a = runRound('drunk', 11, evasiveBot());
    const b = runRound('drunk', 11, evasiveBot());
    expect(a).toEqual(b);
  });
});
