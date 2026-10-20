import { CircleGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, Vector3, type BufferGeometry } from 'three';
import { targetTexture } from './textures';
import type { UrinalSurface } from './UrinalSurface';

const tmpP = new Vector3();
const tmpN = new Vector3();

/**
 * 便器の曲面にぴったり沿わせて貼る円形マーカー。
 * 平らな円盤を接平面に置くと、内側に湾曲した壁に縁がめり込んで欠けるため、
 * 頂点ごとに (u,v) → 曲面上の点 へ写して貼り付ける（的・照準リング）。
 */
class ConformedDisc {
  readonly geometry: BufferGeometry;
  private readonly base: Float32Array;

  constructor(
    template: BufferGeometry,
    private readonly surface: UrinalSurface,
  ) {
    this.geometry = template.clone();
    this.base = Float32Array.from(template.getAttribute('position').array as ArrayLike<number>);
    template.dispose();
  }

  /** (u,v) を中心に、scale 倍の大きさで、法線方向に offset 浮かせて貼る */
  place(u: number, v: number, offset: number, scale = 1): void {
    const pos = this.geometry.getAttribute('position');
    const nor = this.geometry.getAttribute('normal');
    const w = this.surface.widthM;
    const h = this.surface.heightM;
    for (let i = 0; i < pos.count; i++) {
      // テンプレートの xy（メートル）を曲面上の弧長として扱う
      const pu = u + (this.base[i * 3] * scale) / w;
      const pv = v + (this.base[i * 3 + 1] * scale) / h;
      this.surface.surfacePoint(pu, pv, tmpP);
      this.surface.surfaceNormal(pu, pv, tmpN);
      tmpP.addScaledVector(tmpN, offset);
      pos.setXYZ(i, tmpP.x, tmpP.y, tmpP.z);
      nor.setXYZ(i, tmpN.x, tmpN.y, tmpN.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
}

/** プレイヤーの的（赤白マーク） */
export class TargetMarker {
  readonly mesh: Mesh;
  private readonly material: MeshStandardMaterial;
  private readonly disc: ConformedDisc;
  private flash = 0;
  private u = 0.5;
  private v = 0.5;

  constructor(surface: UrinalSurface, radius: number) {
    this.material = new MeshStandardMaterial({
      map: targetTexture(),
      roughness: 0.35,
      emissive: 0x330000,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.disc = new ConformedDisc(new CircleGeometry(radius, 48), surface);
    this.mesh = new Mesh(this.disc.geometry, this.material);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }

  setPosition(u: number, v: number): void {
    this.u = u;
    this.v = v;
    this.disc.place(u, v, 0.0015, 1 + this.flash * 0.25);
  }

  hitFlash(): void {
    this.flash = 1;
  }

  update(dt: number): void {
    const before = this.flash;
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.material.emissive.setRGB(0.2 + this.flash * 0.8, this.flash * 0.7, 0);
    if (before !== this.flash) this.setPosition(this.u, this.v);
  }
}

/** 照準の予告リング（2WAY/3WAY では尿流の本数ぶん出す）。予備動作・再開予兆・区間の切り替えでは点滅する */
export class AimRing {
  readonly group = new Group();
  private readonly material: MeshBasicMaterial;
  private readonly discs: ConformedDisc[] = [];
  private readonly meshes: Mesh[] = [];
  private time = 0;
  private scale = 1;

  constructor(
    surface: UrinalSurface,
    private readonly baseRadius: number,
    maxRings = 3,
  ) {
    this.material = new MeshBasicMaterial({ color: 0xffc81e, transparent: true, opacity: 0.8, depthWrite: false });
    for (let i = 0; i < maxRings; i++) {
      const disc = new ConformedDisc(new RingGeometry(baseRadius * 0.72, baseRadius, 40), surface);
      const m = new Mesh(disc.geometry, this.material);
      m.renderOrder = 3;
      m.visible = false;
      m.frustumCulled = false;
      this.discs.push(disc);
      this.meshes.push(m);
      this.group.add(m);
    }
  }

  setRadius(radius: number): void {
    this.scale = radius / this.baseRadius;
  }

  /** mode: 'warn' 点滅 / 'live' 常時表示 / 'off' 非表示 */
  update(dt: number, points: ReadonlyArray<{ u: number; v: number }>, mode: 'warn' | 'live' | 'off'): void {
    this.time += dt;
    this.material.opacity = mode === 'warn' ? (Math.sin(this.time * 22) > 0 ? 0.95 : 0.25) : 0.55;
    this.meshes.forEach((m, i) => {
      const p = points[i];
      m.visible = mode !== 'off' && p !== undefined;
      if (m.visible) this.discs[i].place(p.u, p.v, 0.003, this.scale);
    });
  }
}

