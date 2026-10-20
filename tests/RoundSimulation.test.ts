import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../src/attacks/AttackTypes';
import { ENEMY_KINDS, getProfile, type EnemyKind } from '../src/entities/EnemyProfiles';
import { DifficultyDirector } from '../src/game/DifficultyDirector';
import { GameConfig } from '../src/game/GameConfig';
import { RoundSimulation, type RoundDifficulty } from '../src/game/RoundSimulation';
import type { AttackKind } from '../src/attacks/AttackTypes';
import { SeededRandom } from '../src/game/SeededRandom';
import { UrinalSurface } from '../src/scene/UrinalSurface';
import { createAutopilot } from '../src/debug/Autopilot';

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

const plannerBot = (): Bot => createAutopilot(surface);

describe('RoundSimulation', () => {
  // 隙間や扇の要に居座れば当たらない、という攻略法を作らない（2WAY の隙間に置きっぱなしで避けられた不具合の再発防止）
  it('どの攻撃でも、動かない的にはいずれ命中する', () => {
    const difficulty = new DifficultyDirector();
    const cases: Array<[AttackKind, number]> = [['single', 1], ['twoWay', 4], ['threeWay', 8], ['shotgun', 13], ['combo', 18]];
    for (const [attack, n] of cases) {
      for (const kind of ENEMY_KINDS) {
        for (const seed of [1, 2, 3]) {
          const r = runRound(kind, seed, idle, difficulty.forEnemy(n), attack);
          expect(r.outcome, `${attack} × ${kind} seed ${seed}`).toBe('hit');
        }
      }
    }
  });

  it('動かない的にはいずれ命中する（予備動作中は当たらない）', () => {
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
