import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../src/attacks/AttackTypes';
import { ENEMY_KINDS, getProfile, type EnemyKind } from '../src/entities/EnemyProfiles';
import { DifficultyDirector } from '../src/game/DifficultyDirector';
import { GameConfig } from '../src/game/GameConfig';
import { RoundSimulation, type RoundDifficulty } from '../src/game/RoundSimulation';
import type { AttackKind } from '../src/attacks/AttackTypes';
import { SeededRandom } from '../src/game/SeededRandom';
import { normalizeMove } from '../src/input/InputManager';
import { UrinalSurface } from '../src/scene/UrinalSurface';

const surface = new UrinalSurface();
const STEP = GameConfig.simulation.fixedStep;

type Bot = (sim: RoundSimulation) => Vec2;

const BASE = { trackingMultiplier: 1, fireIntervalMultiplier: 1, pelletCount: 5 };

function runRound(kind: EnemyKind, seed: number, bot: Bot, difficulty: RoundDifficulty = BASE, attack: AttackKind = 'single') {
  const sim = new RoundSimulation(surface);
  sim.begin(getProfile(kind), attack, difficulty, new SeededRandom(seed));
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
 * 計画型ボット（上手い人間の代用）。見えている情報だけを使う:
 * 飛行中の尿粒・予告マーカーの着弾、照準リング（＝ timeToImpact 後にそこへ着弾し続ける）。
 * 9方向それぞれについて、その方向へ動き続けた場合の進路を 0.6 秒先まで試算し、
 * 最初にぶつかる時刻が最も遅く、余裕の大きい方向を選ぶ。反応は 1/30 秒ごと。
 */
function plannerBot(): Bot {
  const dirs: Vec2[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < 8; i++) dirs.push(normalizeMove(Math.round(Math.cos((i * Math.PI) / 4)), Math.round(Math.sin((i * Math.PI) / 4))));
  let current: Vec2 = { x: 0, y: 0 };
  let counter = 0;
  const HORIZON = 0.6;
  const DT = 0.04;
  return (sim) => {
    if (counter++ % 4 !== 0) return current;
    const now = sim.time;
    const p = sim.player.position;
    const enemy = sim.enemy!;
    const speed = sim.player.speed;
    const hr = sim.player.hitRadius;
    const margin = 0.008;
    const visible = sim.impacts.filter(
      (i) => i.endAt >= now && (i.spawnAt <= now || (i.warnAt !== undefined && i.warnAt <= now)),
    ).map((i) => ({ c: surface.toMetricUV(i.u, i.v), from: i.impactAt - now, to: i.endAt - now, r: i.radius }));
    const tti = enemy.profile.timeToImpact;
    const pattern = enemy.state === 'windup' ? sim.attacks.patternAt(enemy.profile.windupSeconds) : sim.attacks.pattern;
    const firing = enemy.state === 'streaming' || enemy.state === 'windup' || enemy.state === 'warning';
    const streamTargets = firing && pattern !== 'shotgun' && pattern !== 'gap'
      ? sim.attacks.offsets(pattern).map((o) => ({ x: enemy.aim.x + o.x, y: enemy.aim.y + o.y }))
      : [];
    const startIn = enemy.state === 'windup' ? enemy.profile.windupSeconds - enemy.elapsed + tti : tti;
    const r0 = enemy.profile.impactRadius;
    let best = current;
    let bestScore = -Infinity;
    for (const d of dirs) {
      let q = { ...p };
      let hitAt = HORIZON + DT;
      let clearance = 1;
      for (let t = DT; t <= HORIZON + 1e-9; t += DT) {
        q = surface.clampMetric({ x: q.x + d.x * speed * DT, y: q.y + d.y * speed * DT }, sim.player.visualRadius);
        let worst = 1;
        for (const v of visible) {
          if (t < v.from - 0.02 || t > v.to + 0.02) continue;
          worst = Math.min(worst, Math.hypot(q.x - v.c.x, q.y - v.c.y) - v.r - hr);
        }
        if (t >= startIn) {
          // 照準は的を追ってくるので、時間とともに危険範囲が広がるとみなす
          const swaySpeed = enemy.profile.sway.amplitude * Math.PI * 2 * enemy.profile.sway.frequency;
          const grow = (t - startIn) * (enemy.profile.trackingSpeed + swaySpeed) * 0.8;
          for (const c of streamTargets) worst = Math.min(worst, Math.hypot(q.x - c.x, q.y - c.y) - r0 - hr - grow);
        }
        clearance = Math.min(clearance, worst);
        if (worst < margin) {
          hitAt = t;
          break;
        }
      }
      const center = Math.hypot(q.x - surface.widthM / 2, q.y - surface.heightM / 2);
      const score = hitAt * 10 + Math.min(clearance, 0.1) - center * 0.3 + (d.x === current.x && d.y === current.y ? 0.02 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    current = best;
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

  it('single: 逃げ続ければ全キャラ1人分を生き延びられ、ラウンド長も正しい', () => {
    for (const kind of ENEMY_KINDS) {
      const p = getProfile(kind);
      for (const seed of [1, 2, 3, 4]) {
        const r = runRound(kind, seed, plannerBot());
        expect(r.outcome, `${kind} seed ${seed}`).toBe('cleared');
        // 排尿時間 + 予備動作 + 最後の着弾（跳ね返りを含む）の判定が終わるまで
        expect(r.time).toBeGreaterThanOrEqual(p.windupSeconds + p.durationSeconds);
        expect(r.time).toBeLessThan(p.windupSeconds + p.durationSeconds + p.timeToImpact + p.bounce.delay + 0.3);
      }
    }
  });

  // 解禁人数ちょうどの難易度で、全キャラ×全攻撃に回避経路があるか（見えている情報だけで避けるボット）
  const difficulty = new DifficultyDirector();
  const MATRIX: Array<[AttackKind, number]> = [['twoWay', 4], ['threeWay', 8], ['shotgun', 13], ['combo', 18], ['combo', 40]];
  for (const [attack, enemyNumber] of MATRIX) {
    it(`${attack}（${enemyNumber}人目の難易度）: 全キャラで回避経路が存在する`, () => {
      const diff = difficulty.forEnemy(enemyNumber);
      let total = 0;
      let cleared = 0;
      for (const kind of ENEMY_KINDS) {
        let ok = 0;
        const N = 12;
        for (let s = 0; s < N; s++) if (runRound(kind, 900 + s, plannerBot(), diff, attack).outcome === 'cleared') ok += 1;
        // 最難関（3WAY×酔っ払い）でも過半数は避けられること
        expect(ok, `${attack} × ${kind}: ${ok}/${N}`).toBeGreaterThanOrEqual(Math.ceil(N * 0.6));
        total += N;
        cleared += ok;
      }
      expect(cleared / total).toBeGreaterThanOrEqual(0.85);
    }, 60000);
  }

  it('被弾し続けても（無敵デバッグ時）古い着弾は掃除される', () => {
    const sim = new RoundSimulation(surface);
    sim.begin(getProfile('muscle'), 'threeWay', BASE, new SeededRandom(2));
    let max = 0;
    for (let i = 0; i < 120 * 8; i++) {
      sim.step(STEP, { x: 0, y: 0 });
      max = Math.max(max, sim.impacts.length);
    }
    expect(max).toBeLessThan(250);
  });

  it('clear で前ラウンドの着弾を引き継がない', () => {
    const sim = new RoundSimulation(surface);
    sim.begin(getProfile('salaryman'), 'single', BASE, new SeededRandom(3));
    for (let i = 0; i < 240; i++) sim.step(STEP, { x: 1, y: 0 });
    expect(sim.impacts.length).toBeGreaterThan(0);
    sim.begin(getProfile('drunk'), 'single', BASE, new SeededRandom(4));
    expect(sim.impacts).toHaveLength(0);
    expect(sim.time).toBe(0);
  });

  it('同じシード・同じ入力なら同じ結果（再現性）', () => {
    const a = runRound('drunk', 11, plannerBot());
    const b = runRound('drunk', 11, plannerBot());
    expect(a).toEqual(b);
  });
});
