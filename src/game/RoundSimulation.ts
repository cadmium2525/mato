import { AttackDirector } from '../attacks/AttackDirector';
import type { AttackKind, Impact, Vec2 } from '../attacks/AttackTypes';
import { NearMissTracker, findHit } from '../attacks/Collision';
import { createEnemyController, type EnemyController } from '../entities/EnemyController';
import type { EnemyProfile } from '../entities/EnemyProfiles';
import { TargetPlayer } from '../entities/TargetPlayer';
import type { UrinalSurface } from '../scene/UrinalSurface';
import type { DifficultySettings } from './DifficultyDirector';
import { GameConfig } from './GameConfig';
import type { SeededRandom } from './SeededRandom';

export type RoundDifficulty = Pick<DifficultySettings, 'trackingMultiplier' | 'fireIntervalMultiplier' | 'pelletCount'>;

export interface StepResult {
  hit: Impact | null;
  nearMisses: number;
  /** 排尿が終わり、すべての着弾の判定が終わった（生存） */
  finished: boolean;
}

/**
 * 1ラウンド分の判定ロジック（描画なし・固定ステップ）。
 * Game はこれを毎フレーム回し、結果を RoundDirector / ScoreManager / 描画へ渡す。
 */
export class RoundSimulation {
  readonly player: TargetPlayer;
  readonly attacks = new AttackDirector(GameConfig.attack);
  readonly nearMiss = new NearMissTracker(GameConfig.nearMiss.ringWidth);
  enemy: EnemyController | null = null;
  attackKind: AttackKind = 'single';
  impacts: Impact[] = [];
  /** ラウンド内の時刻（着弾イベントの時刻基準） */
  time = 0;
  private readonly toMetric = (u: number, v: number): Vec2 => this.surface.toMetricUV(u, v);
  private readonly toUV = (x: number, y: number) => this.surface.fromMetric(x, y);

  constructor(private readonly surface: UrinalSurface) {
    this.player = new TargetPlayer(surface);
  }

  /** 古い攻撃・タイマーを破棄して待機状態に戻す */
  clear(): void {
    this.enemy = null;
    this.impacts = [];
    this.time = 0;
    this.nearMiss.reset();
    this.attacks.reset();
    this.player.reset();
  }

  begin(profile: EnemyProfile, attackKind: AttackKind, difficulty: RoundDifficulty, rng: SeededRandom): void {
    this.clear();
    this.attackKind = attackKind;
    const s = this.surface;
    const p = this.player.position;
    // 照準は的と反対側から出す（開始直後の理不尽な被弾を防ぐ）
    const initialAim = { x: p.x < s.widthM / 2 ? s.widthM * 0.85 : s.widthM * 0.15, y: s.heightM * 0.8 };
    this.enemy = createEnemyController(profile, {
      bounds: { width: s.widthM, height: s.heightM },
      initialAim,
      emitInterval: GameConfig.attack.emitInterval,
      trackingMultiplier: difficulty.trackingMultiplier,
      rng,
    });
    this.attacks.beginRound({
      kind: attackKind,
      profile,
      rng: rng.fork(0x5eed),
      fireIntervalMultiplier: difficulty.fireIntervalMultiplier,
      pelletCount: difficulty.pelletCount,
      startAt: profile.windupSeconds,
      endAt: profile.windupSeconds + profile.durationSeconds,
    });
  }

  step(dt: number, move: Vec2): StepResult {
    const result: StepResult = { hit: null, nearMisses: 0, finished: false };
    const enemy = this.enemy;
    if (!enemy) return result;

    this.player.update(dt, move);
    this.time += dt;

    enemy.setTrackingScale(GameConfig.attack.trackingScale[this.attacks.patternAt(this.time)]);
    const shots = enemy.update(dt, this.player.position);
    const fired = this.attacks.update({
      now: this.time,
      shots,
      streaming: enemy.state === 'streaming',
      aim: enemy.aim,
      toUV: this.toUV,
    });
    for (const imp of fired) this.impacts.push(imp);

    // 判定の終わった着弾を捨てる（飛沫表示のため少しだけ猶予）。被弾時の早期 return より前に行う
    const now = this.time;
    if (this.impacts.some((i) => i.endAt + 0.2 < now)) {
      this.impacts = this.impacts.filter((i) => i.endAt + 0.2 >= now);
    }

    result.hit = findHit(this.player.previous, this.player.position, this.player.hitRadius, this.impacts, this.time, this.toMetric);
    if (result.hit) return result;

    result.nearMisses = this.nearMiss.update(this.player.position, this.player.hitRadius, this.impacts, this.time, this.toMetric);

    result.finished = enemy.state === 'done' && !this.impacts.some((i) => i.endAt >= now);
    return result;
  }
}
