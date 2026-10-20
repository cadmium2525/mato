import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type ShaderMaterial,
} from 'three';
import type { Impact } from '../attacks/AttackTypes';
import type { UrinalSurface } from './UrinalSurface';
import { createDropletMaterial, createRunoffMaterial, createSplatMaterial, createStreamMaterial, createWarningMaterial } from './water/WaterMaterials';

const Z_AXIS = new Vector3(0, 0, 1);
const GRAVITY = -9.8;
const MAX_TUBES = 8;
const MAX_TUBE_POINTS = 40;
const MAX_DROPS = 160;
const MAX_SPLAT = 320;
const MAX_WARN = 64;
const SPLAT_FADE = 0.5;

export interface VfxQuality {
  /** 飛沫パーティクルの上限 */
  maxSpray: number;
  /** 着弾1回あたりの飛沫数の倍率 */
  sprayScale: number;
  /** 尿流チューブの円周分割数 */
  tubeRadial: number;
}

export const VFX_QUALITY: Record<'high' | 'medium' | 'low', VfxQuality> = {
  high: { maxSpray: 900, sprayScale: 1, tubeRadial: 10 },
  medium: { maxSpray: 450, sprayScale: 0.6, tubeRadial: 8 },
  low: { maxSpray: 160, sprayScale: 0.3, tubeRadial: 6 },
};

/** 1本の連続した尿流。頂点バッファを使い回し、毎フレーム中身だけ書き換える */
class StreamTube {
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;
  private readonly uv: Float32Array;
  private readonly alpha: Float32Array;
  private readonly flow: Float32Array;
  private readonly t = new Vector3();
  private readonly n = new Vector3();
  private readonly b = new Vector3();
  private readonly ref = new Vector3();
  private radial: number;

  constructor(material: ShaderMaterial, radial: number) {
    this.radial = radial;
    const maxRadial = 12;
    const verts = MAX_TUBE_POINTS * (maxRadial + 1);
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    this.uv = new Float32Array(verts * 2);
    this.alpha = new Float32Array(verts);
    this.flow = new Float32Array(verts);
    const attr = (arr: Float32Array, size: number) => new BufferAttribute(arr, size).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', attr(this.pos, 3));
    this.geometry.setAttribute('normal', attr(this.nor, 3));
    this.geometry.setAttribute('uv', attr(this.uv, 2));
    this.geometry.setAttribute('aAlpha', attr(this.alpha, 1));
    this.geometry.setAttribute('aFlow', attr(this.flow, 1));
    this.geometry.setIndex(new BufferAttribute(new Uint16Array((MAX_TUBE_POINTS - 1) * maxRadial * 6), 1));
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this.buildIndex();
  }

  setRadial(radial: number): void {
    this.radial = Math.max(3, Math.min(12, radial));
    this.buildIndex();
  }

  private buildIndex(): void {
    const index = this.geometry.getIndex()!;
    const arr = index.array as Uint16Array;
    const R = this.radial;
    let k = 0;
    for (let i = 0; i < MAX_TUBE_POINTS - 1; i++) {
      for (let j = 0; j < R; j++) {
        const a = i * (R + 1) + j;
        const c = a + R + 1;
        // 外向きの面が表になる巻き順
        arr[k++] = a;
        arr[k++] = a + 1;
        arr[k++] = c;
        arr[k++] = a + 1;
        arr[k++] = c + 1;
        arr[k++] = c;
      }
    }
    index.needsUpdate = true;
  }

  /** points は発射口側 → 壁側の順。radii は各点の半径 */
  set(points: readonly Vector3[], radii: readonly number[], alphas: readonly number[]): void {
    const n = Math.min(points.length, MAX_TUBE_POINTS);
    if (n < 2) {
      this.mesh.visible = false;
      return;
    }
    const R = this.radial;
    let len = 0;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (i > 0) len += p.distanceTo(points[i - 1]);
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(n - 1, i + 1)];
      this.t.subVectors(next, prev).normalize();
      this.ref.set(Math.abs(this.t.y) < 0.9 ? 0 : 1, Math.abs(this.t.y) < 0.9 ? 1 : 0, 0);
      this.n.crossVectors(this.t, this.ref).normalize();
      this.b.crossVectors(this.t, this.n).normalize();
      for (let j = 0; j <= R; j++) {
        const ang = (j / R) * Math.PI * 2;
        const cx = Math.cos(ang);
        const cy = Math.sin(ang);
        const nx = this.n.x * cx + this.b.x * cy;
        const ny = this.n.y * cx + this.b.y * cy;
        const nz = this.n.z * cx + this.b.z * cy;
        const vi = i * (R + 1) + j;
        const r = radii[i];
        this.pos[vi * 3] = p.x + nx * r;
        this.pos[vi * 3 + 1] = p.y + ny * r;
        this.pos[vi * 3 + 2] = p.z + nz * r;
        this.nor[vi * 3] = nx;
        this.nor[vi * 3 + 1] = ny;
        this.nor[vi * 3 + 2] = nz;
        this.uv[vi * 2] = j / R;
        this.uv[vi * 2 + 1] = len;
        this.alpha[vi] = alphas[i];
        this.flow[vi] = 1;
      }
    }
    for (const name of ['position', 'normal', 'uv', 'aAlpha', 'aFlow']) this.geometry.getAttribute(name).needsUpdate = true;
    this.geometry.setDrawRange(0, (n - 1) * R * 6);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }
}

interface Splat {
  pos: Vector3;
  quat: Quaternion;
  radius: number;
  activeUntil: number;
  bornAt: number;
}

/**
 * 尿の見た目。AttackDirector が作った Impact 配列をそのまま可視化する（判定には関与しない）。
 * - 尿流: 同じ流れ（lane）の飛行中の着弾をつないだ連続チューブ。各点は spawnAt に発射口を出て
 *   impactAt にちょうど着弾点へ届く放物線上にあるので、見た目と判定のタイミングが一致する
 * - 散弾・跳ね返り: 個別の水滴
 * - 着弾: 判定中は判定円をくっきり、その後は波紋。跳ね返る飛沫パーティクル
 * - 予告: 着弾予定地点のオレンジのリング（着弾が近づくほど判定の大きさへ縮む）
 */
export class StreamVFX {
  readonly group = new Group();
  /** このフレームで着弾した Impact（汚れ・効果音用） */
  readonly landings: Impact[] = [];

  private readonly streamMaterial = createStreamMaterial();
  private readonly dropMaterial = createDropletMaterial(0.88);
  private readonly sprayMaterial = createDropletMaterial(0.8);
  private readonly splatMaterial = createSplatMaterial();
  private readonly warnMaterial = createWarningMaterial();
  private readonly runoffMaterial = createRunoffMaterial();
  private readonly tubes: StreamTube[] = [];
  /** 各尿流の着弾点から壁を流れ落ちる膜 */
  private readonly runoffs: Mesh[] = [];
  private runoffUsed = 0;
  private readonly drops: InstancedMesh;
  private readonly spray: InstancedMesh;
  private readonly splats: InstancedMesh;
  private readonly warnings: InstancedMesh;
  private readonly splatAge: InstancedBufferAttribute;
  private readonly splatActive: InstancedBufferAttribute;
  private readonly warnProgress: InstancedBufferAttribute;

  private readonly splatPool: Splat[] = [];
  private splatCursor = 0;
  private readonly landed = new Set<number>();
  private lastNow = 0;
  private time = 0;
  private quality: VfxQuality = VFX_QUALITY.high;

  // 飛沫パーティクル（構造体配列で持ち、GC を出さない）
  private readonly sPos: Float32Array;
  private readonly sVel: Float32Array;
  private readonly sLife: Float32Array;
  private readonly sMax: Float32Array;
  private readonly sSize: Float32Array;
  private sprayCount = 0;
  private readonly sprayCapacity = 900;

  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly target = new Vector3();
  private readonly n = new Vector3();
  private readonly s = new Vector3();
  private readonly q = new Quaternion();
  private readonly from = new Vector3();
  private readonly fromN = new Vector3();
  private readonly tmp = new Vector3();
  private readonly pointPool: Vector3[] = Array.from({ length: MAX_TUBE_POINTS }, () => new Vector3());

  constructor(
    private readonly surface: UrinalSurface,
    private readonly origin: Vector3,
    private readonly arcHeight: number,
    private readonly emitInterval: number,
  ) {
    // 上端が原点、下へ伸びる板
    const runoffGeo = new PlaneGeometry(1, 1).translate(0, -0.5, 0);
    for (let i = 0; i < MAX_TUBES; i++) {
      const tube = new StreamTube(this.streamMaterial, this.quality.tubeRadial);
      this.tubes.push(tube);
      this.group.add(tube.mesh);
      const runoff = new Mesh(runoffGeo, this.runoffMaterial);
      runoff.visible = false;
      runoff.renderOrder = 3;
      runoff.frustumCulled = false;
      this.runoffs.push(runoff);
      this.group.add(runoff);
    }

    const sphere = new SphereGeometry(1, 10, 8);
    this.drops = new InstancedMesh(sphere, this.dropMaterial, MAX_DROPS);
    this.spray = new InstancedMesh(new SphereGeometry(1, 6, 5), this.sprayMaterial, this.sprayCapacity);
    for (const im of [this.drops, this.spray]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = 7;
    }

    const circle = new CircleGeometry(1, 28);
    this.splats = new InstancedMesh(circle, this.splatMaterial, MAX_SPLAT);
    this.splatAge = new InstancedBufferAttribute(new Float32Array(MAX_SPLAT), 1).setUsage(DynamicDrawUsage);
    this.splatActive = new InstancedBufferAttribute(new Float32Array(MAX_SPLAT), 1).setUsage(DynamicDrawUsage);
    this.splats.geometry.setAttribute('aAge', this.splatAge);
    this.splats.geometry.setAttribute('aActive', this.splatActive);
    this.splats.renderOrder = 4;

    this.warnings = new InstancedMesh(new CircleGeometry(1, 32), this.warnMaterial, MAX_WARN);
    this.warnProgress = new InstancedBufferAttribute(new Float32Array(MAX_WARN), 1).setUsage(DynamicDrawUsage);
    this.warnings.geometry.setAttribute('aProgress', this.warnProgress);
    this.warnings.renderOrder = 5;
    for (const im of [this.splats, this.warnings]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
    }
    this.group.add(this.splats, this.warnings, this.drops, this.spray);

    this.sPos = new Float32Array(this.sprayCapacity * 3);
    this.sVel = new Float32Array(this.sprayCapacity * 3);
    this.sLife = new Float32Array(this.sprayCapacity);
    this.sMax = new Float32Array(this.sprayCapacity);
    this.sSize = new Float32Array(this.sprayCapacity);
  }

  setQuality(q: VfxQuality): void {
    this.quality = q;
    for (const t of this.tubes) t.setRadial(q.tubeRadial);
    this.sprayCount = Math.min(this.sprayCount, q.maxSpray);
  }

  clear(): void {
    this.splatPool.length = 0;
    this.splatCursor = 0;
    this.landed.clear();
    this.sprayCount = 0;
    this.drops.count = 0;
    this.spray.count = 0;
    this.splats.count = 0;
    this.warnings.count = 0;
    for (const t of this.tubes) t.hide();
    for (const r of this.runoffs) r.visible = false;
    this.landings.length = 0;
  }

  /** 的への命中: 大きな水しぶき */
  burst(u: number, v: number, radius: number, now: number): void {
    this.addSplat(u, v, radius * 2.4, now, now);
    this.surface.surfacePoint(u, v, this.p);
    this.surface.surfaceNormal(u, v, this.n);
    this.emitSpray(this.p, this.n, 60, 1.4);
  }

  update(impacts: readonly Impact[], now: number, dt: number): void {
    this.time += dt;
    for (const mat of [this.streamMaterial, this.dropMaterial, this.sprayMaterial, this.warnMaterial, this.runoffMaterial]) {
      if (mat.uniforms.uTime) mat.uniforms.uTime.value = this.time;
    }
    this.landings.length = 0;
    this.updateTubes(impacts, now);

    let di = 0;
    let wi = 0;
    for (const impact of impacts) {
      // 着弾の検出（このフレームで初めて着弾したもの）
      if (now >= impact.impactAt && !this.landed.has(impact.id) && this.lastNow <= impact.endAt + 0.05) {
        this.landed.add(impact.id);
        this.landings.push(impact);
        this.onLanded(impact);
      }
      // 散弾・跳ね返りの水滴
      if (impact.kind !== 'stream' && now >= impact.spawnAt && now < impact.impactAt && di < MAX_DROPS) {
        const t = (now - impact.spawnAt) / (impact.impactAt - impact.spawnAt);
        const origin = this.dropOrigin(impact);
        this.surface.surfacePoint(impact.u, impact.v, this.target);
        const arc = impact.fromU !== undefined ? 0.03 : this.arcHeight;
        this.p.lerpVectors(origin, this.target, t);
        this.p.y += arc * 4 * t * (1 - t);
        const r = 0.0028 + impact.radius * 0.1;
        this.s.set(r, r, r * 2.4);
        this.q.setFromUnitVectors(Z_AXIS, this.n.subVectors(this.target, origin).normalize());
        this.m.compose(this.p, this.q, this.s);
        this.drops.setMatrixAt(di++, this.m);
      }
      // 着弾予告
      if (impact.warnAt !== undefined && now >= impact.warnAt && now < impact.impactAt && wi < MAX_WARN) {
        const k = (now - impact.warnAt) / (impact.impactAt - impact.warnAt);
        const scale = impact.radius * (1.9 - 0.9 * k);
        this.surface.surfacePoint(impact.u, impact.v, this.p);
        this.surface.surfaceNormal(impact.u, impact.v, this.n);
        this.p.addScaledVector(this.n, 0.005);
        this.q.setFromUnitVectors(Z_AXIS, this.n);
        this.s.set(scale, scale, 1);
        this.m.compose(this.p, this.q, this.s);
        this.warnings.setMatrixAt(wi, this.m);
        this.warnProgress.setX(wi, k);
        wi++;
      }
    }
    this.drops.count = di;
    this.drops.instanceMatrix.needsUpdate = true;
    this.warnings.count = wi;
    this.warnings.instanceMatrix.needsUpdate = true;
    this.warnProgress.needsUpdate = true;

    this.updateSplats(now);
    this.updateSpray(dt);

    if (this.landed.size > 3000) {
      const alive = new Set(impacts.map((i) => i.id));
      for (const id of this.landed) if (!alive.has(id)) this.landed.delete(id);
    }
    this.lastNow = now;
  }

  // ------------------------------------------------------------ stream tubes

  private updateTubes(impacts: readonly Impact[], now: number): void {
    // lane ごとに、発射済みの尿流の着弾を新しい順に集める
    const lanes = new Map<number, Impact[]>();
    for (const imp of impacts) {
      if (imp.kind !== 'stream' || imp.lane === undefined || now < imp.spawnAt) continue;
      if (now >= imp.impactAt + 0.05) continue;
      let list = lanes.get(imp.lane);
      if (!list) lanes.set(imp.lane, (list = []));
      list.push(imp);
    }
    let tubeIndex = 0;
    this.runoffUsed = 0;
    const breakGap = this.emitInterval * 3.5;
    for (const list of lanes.values()) {
      list.sort((a, b) => b.spawnAt - a.spawnAt);
      let start = 0;
      while (start < list.length && tubeIndex < MAX_TUBES) {
        // 途切れ（おじいちゃんの休止など）で別のチューブに分ける
        let end = start + 1;
        while (end < list.length && list[end - 1].spawnAt - list[end].spawnAt <= breakGap) end++;
        this.buildTube(this.tubes[tubeIndex++], list.slice(start, end), now);
        start = end;
      }
    }
    for (let i = tubeIndex; i < MAX_TUBES; i++) this.tubes[i].hide();
    for (let i = this.runoffUsed; i < MAX_TUBES; i++) this.runoffs[i].visible = false;
  }

  /** 着弾点に、壁を流れ落ちる膜を置く */
  private placeRunoff(imp: Impact): void {
    if (this.runoffUsed >= this.runoffs.length) return;
    const mesh = this.runoffs[this.runoffUsed++];
    this.surface.surfacePoint(imp.u, imp.v, this.p);
    this.surface.surfaceNormal(imp.u, imp.v, this.n);
    mesh.position.copy(this.p).addScaledVector(this.n, 0.0015);
    mesh.lookAt(this.tmp.copy(mesh.position).add(this.n));
    // 受け皿より下へは伸ばさない
    const length = Math.min(0.09, Math.max(0.02, this.p.y - 0.48));
    mesh.scale.set(imp.radius * 2.2, length, 1);
    mesh.visible = true;
  }

  private buildTube(tube: StreamTube, strip: Impact[], now: number): void {
    const pts: Vector3[] = [];
    const radii: number[] = [];
    const alphas: number[] = [];
    const newest = strip[0];
    const base = 0.0033 * Math.sqrt(newest.radius / 0.026);
    // 発射口（まだ出続けているときだけ）
    const flowing = now - newest.spawnAt < this.emitInterval * 2.5;
    // 点が多すぎるときは間引く（見た目のみ）
    const stride = Math.max(1, Math.ceil(strip.length / (MAX_TUBE_POINTS - 3)));
    let k = 0;
    if (flowing) pts.push(this.pointPool[k++].copy(this.origin));
    let reachedWall = false;
    for (let i = 0; i < strip.length && k < MAX_TUBE_POINTS - 1; i += stride) {
      const imp = strip[i];
      const out = this.pointPool[k++];
      this.surface.surfacePoint(imp.u, imp.v, this.target);
      if (now >= imp.impactAt) {
        // 着弾済み: 壁の着弾点で流れを終える
        out.copy(this.target);
        pts.push(out);
        reachedWall = true;
        this.placeRunoff(imp);
        break;
      }
      const t = (now - imp.spawnAt) / (imp.impactAt - imp.spawnAt);
      out.lerpVectors(this.origin, this.target, t);
      out.y += this.arcHeight * 4 * t * (1 - t);
      pts.push(out);
    }
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const s = n > 1 ? i / (n - 1) : 0;
      const wobble = 1 + 0.14 * Math.sin(this.time * 47 + i * 1.9) + 0.06 * Math.sin(this.time * 83 + i * 0.7);
      // 発射口付近は細く、壁に当たる直前で少し広がる
      let r = base * (0.6 + 0.4 * Math.min(1, s * 5)) * wobble;
      if (reachedWall) r *= 1 + 0.5 * Math.max(0, (s - 0.85) / 0.15);
      if (!reachedWall && i === n - 1) r *= 0.55;
      radii.push(r);
      alphas.push(flowing && i === 0 ? 0.6 : 1);
    }
    tube.set(pts, radii, alphas);
  }

  private dropOrigin(impact: Impact): Vector3 {
    if (impact.fromU !== undefined && impact.fromV !== undefined) {
      this.surface.surfacePoint(impact.fromU, impact.fromV, this.from);
      this.surface.surfaceNormal(impact.fromU, impact.fromV, this.fromN);
      return this.from.addScaledVector(this.fromN, 0.01);
    }
    return this.origin;
  }

  // ------------------------------------------------------------ splats & spray

  private onLanded(impact: Impact): void {
    this.addSplat(impact.u, impact.v, impact.radius, impact.endAt, impact.impactAt);
    this.surface.surfacePoint(impact.u, impact.v, this.p);
    this.surface.surfaceNormal(impact.u, impact.v, this.n);
    const count = impact.kind === 'stream' ? 2.2 : impact.kind === 'pellet' ? 9 : 5;
    this.emitSpray(this.p, this.n, count, impact.kind === 'stream' ? 1 : 0.8);
  }

  private addSplat(u: number, v: number, radius: number, activeUntil: number, bornAt: number): void {
    const pos = this.surface.surfacePoint(u, v, new Vector3());
    const normal = this.surface.surfaceNormal(u, v, new Vector3());
    pos.addScaledVector(normal, 0.003);
    const quat = new Quaternion().setFromUnitVectors(Z_AXIS, normal);
    const splat: Splat = { pos, quat, radius, activeUntil, bornAt };
    if (this.splatPool.length < MAX_SPLAT) this.splatPool.push(splat);
    else {
      this.splatPool[this.splatCursor] = splat;
      this.splatCursor = (this.splatCursor + 1) % MAX_SPLAT;
    }
  }

  private updateSplats(now: number): void {
    let si = 0;
    for (const sp of this.splatPool) {
      if (now < sp.bornAt) continue;
      const active = now <= sp.activeUntil;
      const age = active ? 0 : (now - sp.activeUntil) / SPLAT_FADE;
      if (age >= 1) continue;
      const scale = active ? sp.radius : sp.radius * (1 + age * 0.9);
      this.s.set(scale, scale, 1);
      this.m.compose(sp.pos, sp.quat, this.s);
      this.splats.setMatrixAt(si, this.m);
      this.splatAge.setX(si, age);
      this.splatActive.setX(si, active ? 1 : 0);
      si++;
    }
    this.splats.count = si;
    this.splats.instanceMatrix.needsUpdate = true;
    this.splatAge.needsUpdate = true;
    this.splatActive.needsUpdate = true;
  }

  /** 着弾点から手前へ跳ね返る飛沫 */
  private emitSpray(at: Vector3, normal: Vector3, count: number, power: number): void {
    // 端数は確率で（1フレームの着弾数が多くても総量が安定する）
    let n = Math.floor(count * this.quality.sprayScale);
    if (Math.random() < count * this.quality.sprayScale - n) n += 1;
    for (let i = 0; i < n; i++) {
      if (this.sprayCount >= this.quality.maxSpray) return;
      const k = this.sprayCount++;
      // 法線方向＋ランダムな接線方向＋少し上向き
      this.tmp.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const out = (0.25 + Math.random() * 0.55) * power;
      const side = (0.15 + Math.random() * 0.45) * power;
      this.sVel[k * 3] = normal.x * out + this.tmp.x * side;
      this.sVel[k * 3 + 1] = normal.y * out + this.tmp.y * side + Math.random() * 0.45 * power;
      this.sVel[k * 3 + 2] = normal.z * out + this.tmp.z * side;
      this.sPos[k * 3] = at.x + normal.x * 0.004;
      this.sPos[k * 3 + 1] = at.y + normal.y * 0.004;
      this.sPos[k * 3 + 2] = at.z + normal.z * 0.004;
      this.sMax[k] = 0.25 + Math.random() * 0.35;
      this.sLife[k] = this.sMax[k];
      this.sSize[k] = 0.0014 + Math.random() * 0.0024;
    }
  }

  private updateSpray(dt: number): void {
    let i = 0;
    while (i < this.sprayCount) {
      this.sLife[i] -= dt;
      if (this.sLife[i] <= 0 || this.sPos[i * 3 + 1] < 0.42) {
        // 末尾と入れ替えて削除
        const last = --this.sprayCount;
        for (let c = 0; c < 3; c++) {
          this.sPos[i * 3 + c] = this.sPos[last * 3 + c];
          this.sVel[i * 3 + c] = this.sVel[last * 3 + c];
        }
        this.sLife[i] = this.sLife[last];
        this.sMax[i] = this.sMax[last];
        this.sSize[i] = this.sSize[last];
        continue;
      }
      this.sVel[i * 3 + 1] += GRAVITY * dt;
      // 空気抵抗
      const drag = Math.max(0, 1 - dt * 1.5);
      for (let c = 0; c < 3; c++) {
        this.sVel[i * 3 + c] *= drag;
        this.sPos[i * 3 + c] += this.sVel[i * 3 + c] * dt;
      }
      this.p.set(this.sPos[i * 3], this.sPos[i * 3 + 1], this.sPos[i * 3 + 2]);
      this.n.set(this.sVel[i * 3], this.sVel[i * 3 + 1], this.sVel[i * 3 + 2]);
      const speed = this.n.length();
      const r = this.sSize[i] * Math.min(1, (this.sLife[i] / this.sMax[i]) * 2.5);
      this.s.set(r, r, r * (1 + Math.min(2.5, speed * 2)));
      if (speed > 1e-4) this.q.setFromUnitVectors(Z_AXIS, this.n.multiplyScalar(1 / speed));
      this.m.compose(this.p, this.q, this.s);
      this.spray.setMatrixAt(i, this.m);
      i++;
    }
    this.spray.count = this.sprayCount;
    this.spray.instanceMatrix.needsUpdate = true;
  }
}
