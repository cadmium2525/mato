import type { Vec2 } from '../attacks/AttackTypes';
import { GameConfig } from '../game/GameConfig';
import type { UrinalSurface } from '../scene/UrinalSurface';

type PlayerParams = typeof GameConfig.player;

/** 的（プレイヤー）。位置はメトリック座標で持ち、(u,v) は派生値 */
export class TargetPlayer {
  position: Vec2 = { x: 0, y: 0 };
  previous: Vec2 = { x: 0, y: 0 };
  readonly speed: number;
  readonly hitRadius: number;
  readonly visualRadius: number;

  constructor(
    private readonly surface: UrinalSurface,
    private readonly params: PlayerParams = GameConfig.player,
  ) {
    this.speed = surface.widthM / params.crossSeconds;
    this.visualRadius = params.visualRadius;
    this.hitRadius = params.visualRadius * params.hitRadiusScale;
    this.reset();
  }

  reset(): void {
    const p = this.surface.toMetricUV(this.params.startU, this.params.startV);
    this.position = this.surface.clampMetric(p, this.visualRadius);
    this.previous = { ...this.position };
  }

  /** move は正規化済み（長さ ≤ 1）の入力ベクトル。+x=右, +y=上 */
  update(dt: number, move: Vec2): void {
    this.previous = { ...this.position };
    const next = {
      x: this.position.x + move.x * this.speed * dt,
      y: this.position.y + move.y * this.speed * dt,
    };
    this.position = this.surface.clampMetric(next, this.visualRadius);
  }

  get uv(): { u: number; v: number } {
    return this.surface.fromMetric(this.position.x, this.position.y);
  }
}
