import {
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Impact } from '../attacks/AttackTypes';
import type { UrinalSurface } from './UrinalSurface';

const MAX_DROPS = 600;
const MAX_SPLASH = 300;
const MAX_WARN = 64;
const SPLASH_LIFE = 0.45;
const Z_AXIS = new Vector3(0, 0, 1);

interface Splash {
  pos: Vector3;
  quat: Quaternion;
  radius: number;
  bornAt: number;
}

/**
 * 尿の見た目。AttackDirector が作った Impact 配列をそのまま可視化する。
 * 尿粒は spawnAt に発射口を出て impactAt にちょうど着弾点へ届く（判定とタイミングが一致）。
 * InstancedMesh を再利用し、毎フレームのジオメトリ生成はしない。
 */
export class StreamVFX {
  readonly drops: InstancedMesh;
  readonly splashes: InstancedMesh;
  /** ショットガン・跳ね返りの着弾予告マーカー。着弾が近づくほど判定半径へ収束する */
  readonly warnings: InstancedMesh;
  private readonly splashPool: Splash[] = [];
  private splashCursor = 0;
  private readonly landed = new Set<number>();
  private lastNow = 0;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly target = new Vector3();
  private readonly n = new Vector3();
  private readonly s = new Vector3();
  private readonly q = new Quaternion();
  private readonly from = new Vector3();
  private readonly fromN = new Vector3();
  private time = 0;

  constructor(
    private readonly surface: UrinalSurface,
    private readonly origin: Vector3,
    private readonly arcHeight: number,
  ) {
    const dropMat = new MeshStandardMaterial({
      color: new Color(0xf2d23a),
      emissive: new Color(0x5a4700),
      roughness: 0.1,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
    });
    this.drops = new InstancedMesh(new SphereGeometry(1, 8, 6), dropMat, MAX_DROPS);
    this.drops.instanceMatrix.setUsage(DynamicDrawUsage);
    this.drops.count = 0;
    this.drops.frustumCulled = false;

    const splashMat = new MeshStandardMaterial({
      color: new Color(0xf5d83f),
      emissive: new Color(0x6b5500),
      roughness: 0.05,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.splashes = new InstancedMesh(new CircleGeometry(1, 20), splashMat, MAX_SPLASH);
    this.splashes.instanceMatrix.setUsage(DynamicDrawUsage);
    this.splashes.count = 0;
    this.splashes.frustumCulled = false;
    this.splashes.renderOrder = 4;

    const warnMat = new MeshBasicMaterial({ color: new Color(0xff5a1f), transparent: true, opacity: 0.9, depthWrite: false });
    this.warnings = new InstancedMesh(new RingGeometry(0.78, 1, 32), warnMat, MAX_WARN);
    this.warnings.instanceMatrix.setUsage(DynamicDrawUsage);
    this.warnings.count = 0;
    this.warnings.frustumCulled = false;
    this.warnings.renderOrder = 5;
  }

  clear(): void {
    this.splashPool.length = 0;
    this.splashCursor = 0;
    this.landed.clear();
    this.drops.count = 0;
    this.splashes.count = 0;
    this.warnings.count = 0;
  }

  /** 的への命中位置に大きめの飛沫を出す */
  burst(u: number, v: number, radius: number, now: number): void {
    this.addSplash(u, v, radius * 2.2, now);
  }

  update(impacts: readonly Impact[], now: number, dt = 0): void {
    this.time += dt;
    // 尿粒
    let di = 0;
    for (const impact of impacts) {
      if (now < impact.spawnAt) continue;
      if (now < impact.impactAt) {
        if (di >= MAX_DROPS) continue;
        const t = (now - impact.spawnAt) / (impact.impactAt - impact.spawnAt);
        this.surface.surfacePoint(impact.u, impact.v, this.target);
        let arc = this.arcHeight;
        let origin = this.origin;
        if (impact.fromU !== undefined && impact.fromV !== undefined) {
          // 跳ね返り: 一次着弾点から壁の手前を小さく跳ねる
          this.surface.surfacePoint(impact.fromU, impact.fromV, this.from);
          this.surface.surfaceNormal(impact.fromU, impact.fromV, this.fromN);
          this.from.addScaledVector(this.fromN, 0.01);
          origin = this.from;
          arc = 0.03;
        }
        this.p.lerpVectors(origin, this.target, t);
        this.p.y += arc * 4 * t * (1 - t);
        const r = 0.0025 + impact.radius * 0.08;
        this.s.set(r, r, r * 3);
        this.q.setFromUnitVectors(Z_AXIS, this.n.subVectors(this.target, origin).normalize());
        this.m.compose(this.p, this.q, this.s);
        this.drops.setMatrixAt(di++, this.m);
      } else if (!this.landed.has(impact.id) && this.lastNow <= impact.endAt) {
        this.landed.add(impact.id);
        this.addSplash(impact.u, impact.v, impact.radius, impact.impactAt);
      }
    }
    this.drops.count = di;
    this.drops.instanceMatrix.needsUpdate = true;

    // 着弾予告マーカー
    let wi = 0;
    for (const impact of impacts) {
      if (impact.warnAt === undefined || now < impact.warnAt || now >= impact.impactAt || wi >= MAX_WARN) continue;
      const k = (now - impact.warnAt) / (impact.impactAt - impact.warnAt);
      const pulse = 1 + 0.06 * Math.sin(this.time * 30);
      const scale = impact.radius * (1.9 - 0.9 * k) * pulse;
      this.surface.surfacePoint(impact.u, impact.v, this.p);
      this.surface.surfaceNormal(impact.u, impact.v, this.n);
      this.p.addScaledVector(this.n, 0.005);
      this.q.setFromUnitVectors(Z_AXIS, this.n);
      this.s.set(scale, scale, 1);
      this.m.compose(this.p, this.q, this.s);
      this.warnings.setMatrixAt(wi++, this.m);
    }
    this.warnings.count = wi;
    this.warnings.instanceMatrix.needsUpdate = true;

    // 着弾飛沫（判定中は判定半径そのまま、その後は広がって消える）
    let si = 0;
    for (const sp of this.splashPool) {
      const age = now - sp.bornAt;
      if (age < 0 || age > SPLASH_LIFE) continue;
      const k = age / SPLASH_LIFE;
      const scale = sp.radius * (age < 0.09 ? 1 : 1 + k * 0.6) * (1 - k * k);
      this.s.set(scale, scale, 1);
      this.m.compose(sp.pos, sp.quat, this.s);
      this.splashes.setMatrixAt(si++, this.m);
    }
    this.splashes.count = si;
    this.splashes.instanceMatrix.needsUpdate = true;

    // 古い着弾IDを掃除
    if (this.landed.size > 2000) {
      const alive = new Set(impacts.map((i) => i.id));
      for (const id of this.landed) if (!alive.has(id)) this.landed.delete(id);
    }
    this.lastNow = now;
  }

  private addSplash(u: number, v: number, radius: number, bornAt: number): void {
    const pos = this.surface.surfacePoint(u, v, new Vector3());
    const normal = this.surface.surfaceNormal(u, v, new Vector3());
    pos.addScaledVector(normal, 0.003);
    const quat = new Quaternion().setFromUnitVectors(Z_AXIS, normal);
    const splash: Splash = { pos, quat, radius, bornAt };
    if (this.splashPool.length < MAX_SPLASH) this.splashPool.push(splash);
    else {
      this.splashPool[this.splashCursor] = splash;
      this.splashCursor = (this.splashCursor + 1) % MAX_SPLASH;
    }
  }
}
