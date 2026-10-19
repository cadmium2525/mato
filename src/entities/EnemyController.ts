import type { Vec2 } from '../attacks/AttackTypes';
import { SeededRandom } from '../game/SeededRandom';
import type { EnemyProfile } from './EnemyProfiles';

export type EnemyState = 'windup' | 'streaming' | 'paused' | 'warning' | 'done';

/** 全キャラ共通のインターフェース。差分はプロファイル（データ）と実装クラスで表す */
export interface EnemyController {
  readonly profile: EnemyProfile;
  readonly state: EnemyState;
  /** 現在の照準点（メトリック座標）。発射時の照準はこの値で確定する */
  readonly aim: Vec2;
  readonly elapsed: number;
  readonly totalSeconds: number;
  /** 1ステップ進め、このステップで発射すべき回数を返す */
  update(dt: number, player: Vec2): number;
}

export interface ControllerOptions {
  bounds: { width: number; height: number };
  initialAim: Vec2;
  emitInterval: number;
  trackingMultiplier: number;
  rng: SeededRandom;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

/**
 * 的を「遅れて目で追う」照準AI。
 * - reactionDelay 秒前の的位置を目標にする
 * - 照準点は trackingSpeed 以下の速度でしか動かない（瞬間移動しない）
 * - aimNoise / sway は時間連続の正弦波の和（フレームごとの乱数ワープはしない）
 * - pulse 設定があれば断続発射し、再開前に warning 状態で予兆を出す
 */
export class TrackingEnemyController implements EnemyController {
  state: EnemyState = 'windup';
  elapsed = 0;
  readonly totalSeconds: number;
  private baseAim: Vec2;
  private current: Vec2;
  private readonly history: Sample[] = [];
  private emitAccumulator = 0;
  private readonly phases: number[];
  private readonly trackingSpeed: number;

  constructor(
    readonly profile: EnemyProfile,
    private readonly options: ControllerOptions,
  ) {
    this.totalSeconds = profile.windupSeconds + profile.durationSeconds;
    this.baseAim = { ...options.initialAim };
    this.current = { ...options.initialAim };
    this.trackingSpeed = profile.trackingSpeed * options.trackingMultiplier;
    // 揺れの位相はシード付き乱数で決める（再現可能）
    this.phases = Array.from({ length: 5 }, () => options.rng.range(0, Math.PI * 2));
  }

  get aim(): Vec2 {
    return this.current;
  }

  update(dt: number, player: Vec2): number {
    this.elapsed += dt;
    this.history.push({ t: this.elapsed, x: player.x, y: player.y });
    // 古い履歴を捨てる
    const keepAfter = this.elapsed - this.profile.reactionDelaySeconds - 0.5;
    while (this.history.length > 2 && this.history[1].t < keepAfter) this.history.shift();

    this.updateAim(dt);
    this.state = this.computeState();

    if (this.state !== 'streaming') {
      this.emitAccumulator = 0;
      return 0;
    }
    this.emitAccumulator += dt;
    let shots = 0;
    while (this.emitAccumulator >= this.options.emitInterval) {
      this.emitAccumulator -= this.options.emitInterval;
      shots += 1;
    }
    return shots;
  }

  private delayedTarget(): Vec2 {
    const t = this.elapsed - this.profile.reactionDelaySeconds;
    let chosen = this.history[0];
    for (const s of this.history) {
      if (s.t <= t) chosen = s;
      else break;
    }
    return { x: chosen.x, y: chosen.y };
  }

  private updateAim(dt: number): void {
    const target = this.delayedTarget();
    const dx = target.x - this.baseAim.x;
    const dy = target.y - this.baseAim.y;
    const d = Math.hypot(dx, dy);
    const step = this.trackingSpeed * dt;
    if (d <= step) {
      this.baseAim = target;
    } else {
      this.baseAim = { x: this.baseAim.x + (dx / d) * step, y: this.baseAim.y + (dy / d) * step };
    }

    const t = this.elapsed;
    const p = this.phases;
    const n = this.profile.aimNoise;
    const sway = this.profile.sway;
    let ox = n * (0.6 * Math.sin(t * 7.1 + p[0]) + 0.4 * Math.sin(t * 12.7 + p[1]));
    let oy = n * (0.6 * Math.sin(t * 6.3 + p[2]) + 0.4 * Math.sin(t * 11.3 + p[3]));
    if (sway.amplitude > 0) {
      ox += sway.amplitude * Math.sin(t * Math.PI * 2 * sway.frequency + p[4]);
      oy += sway.amplitude * 0.25 * Math.sin(t * Math.PI * 4 * sway.frequency + p[4]);
    }
    const { width, height } = this.options.bounds;
    this.current = {
      x: Math.min(width, Math.max(0, this.baseAim.x + ox)),
      y: Math.min(height, Math.max(0, this.baseAim.y + oy)),
    };
  }

  private computeState(): EnemyState {
    const { windupSeconds, durationSeconds, pulse } = this.profile;
    if (this.elapsed < windupSeconds) return 'windup';
    const s = this.elapsed - windupSeconds;
    if (s >= durationSeconds) return 'done';
    if (pulse.onSeconds <= 0) return 'streaming';
    const cycle = pulse.onSeconds + pulse.offSeconds;
    const c = s % cycle;
    if (c < pulse.onSeconds) return 'streaming';
    // 残り時間が1サイクル未満なら再開しないので予兆も出さない
    const resumesAt = s - c + cycle;
    if (c >= cycle - pulse.warningSeconds && resumesAt < durationSeconds) return 'warning';
    return 'paused';
  }
}

export function createEnemyController(profile: EnemyProfile, options: ControllerOptions): EnemyController {
  // 現在は全キャラ共通の追尾AI。キャラ固有の挙動はプロファイルの数値で表現する。
  // TODO(phase2): muscle 専用の跳ね返り判定など、必要に応じて派生クラスを返す
  return new TrackingEnemyController(profile, options);
}
