import { Vector3 } from 'three';
import type { Vec2 } from '../attacks/AttackTypes';
import { GameConfig } from '../game/GameConfig';

type SurfaceParams = typeof GameConfig.surface;

/**
 * 小便器内壁のプレイ可能領域。
 * ゲームロジックは正規化座標 (u,v) ∈ [0,1]² と、それを実寸に直した
 * メトリック座標 (x,y) [m] で動く。描画（的・着弾）は surfacePoint / surfaceNormal で
 * 同じ (u,v) から3D座標を求めるので、見た目と判定がずれない。
 *
 * 内壁は鉛直な楕円柱の一部:
 *   P(θ, y) = (Rx·sinθ, y, cz − Rz·cosθ)
 * u は θ ではなく「弧長の割合」に対応させる（テーブル引き）。
 * これにより toMetricUV が横方向でも等方（u の差 × 横幅 = 実際の弧長）になる。
 */
export class UrinalSurface {
  readonly widthM: number;
  readonly heightM: number;
  readonly thetaMax: number;
  private readonly arcTable: Float64Array;
  private readonly samples = 512;

  constructor(readonly params: SurfaceParams = GameConfig.surface) {
    this.thetaMax = (params.thetaMaxDeg * Math.PI) / 180;
    this.heightM = params.height;
    // 弧長の累積テーブル
    this.arcTable = new Float64Array(this.samples + 1);
    let acc = 0;
    const dTheta = (2 * this.thetaMax) / this.samples;
    for (let i = 1; i <= this.samples; i++) {
      const tMid = -this.thetaMax + (i - 0.5) * dTheta;
      acc += this.arcSpeed(tMid) * dTheta;
      this.arcTable[i] = acc;
    }
    this.widthM = acc;
  }

  private arcSpeed(theta: number): number {
    const { radiusX: rx, radiusZ: rz } = this.params;
    return Math.hypot(rx * Math.cos(theta), rz * Math.sin(theta));
  }

  /** u（弧長割合）→ θ。範囲外は端の弧長速度で外挿（表示用） */
  thetaFromU(u: number): number {
    const dTheta = (2 * this.thetaMax) / this.samples;
    const s = u * this.widthM;
    if (s <= 0) return -this.thetaMax + s / this.arcSpeed(-this.thetaMax);
    if (s >= this.widthM) return this.thetaMax + (s - this.widthM) / this.arcSpeed(this.thetaMax);
    let lo = 0;
    let hi = this.samples;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.arcTable[mid] <= s) lo = mid;
      else hi = mid;
    }
    const a = this.arcTable[lo];
    const b = this.arcTable[hi];
    const t = b > a ? (s - a) / (b - a) : 0;
    return -this.thetaMax + (lo + t) * dTheta;
  }

  yFromV(v: number): number {
    return this.params.yBottom + v * this.params.height;
  }

  // ---- 2D ----

  toMetricUV(u: number, v: number): Vec2 {
    return { x: u * this.widthM, y: v * this.heightM };
  }

  fromMetric(x: number, y: number): { u: number; v: number } {
    return { u: x / this.widthM, v: y / this.heightM };
  }

  isInsidePlayableArea(u: number, v: number): boolean {
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }

  /** 半径 marginM の円が領域からはみ出さないように中心を制限する（メトリック座標） */
  clampMetric(p: Vec2, marginM: number): Vec2 {
    return {
      x: Math.min(this.widthM - marginM, Math.max(marginM, p.x)),
      y: Math.min(this.heightM - marginM, Math.max(marginM, p.y)),
    };
  }

  clampToPlayableArea(u: number, v: number, marginM = 0): { u: number; v: number } {
    const m = this.clampMetric(this.toMetricUV(u, v), marginM);
    return this.fromMetric(m.x, m.y);
  }

  // ---- 3D ----

  pointAtTheta(theta: number, y: number, target = new Vector3(), inset = 0): Vector3 {
    const { radiusX: rx, radiusZ: rz, centerZ: cz } = this.params;
    target.set(rx * Math.sin(theta), y, cz - rz * Math.cos(theta));
    if (inset !== 0) {
      const n = this.normalAtTheta(theta, new Vector3());
      target.addScaledVector(n, inset);
    }
    return target;
  }

  /** 便器の内側（手前）を向く法線 */
  normalAtTheta(theta: number, target = new Vector3()): Vector3 {
    const { radiusX: rx, radiusZ: rz } = this.params;
    return target.set(-rz * Math.sin(theta), 0, rx * Math.cos(theta)).normalize();
  }

  surfacePoint(u: number, v: number, target = new Vector3()): Vector3 {
    return this.pointAtTheta(this.thetaFromU(u), this.yFromV(v), target);
  }

  surfaceNormal(u: number, v: number, target = new Vector3()): Vector3 {
    void v; // 鉛直な柱面なので v に依存しない
    return this.normalAtTheta(this.thetaFromU(u), target);
  }
}
