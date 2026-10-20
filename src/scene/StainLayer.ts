import { CanvasTexture, Mesh, MeshPhysicalMaterial, SRGBColorSpace, type BufferGeometry } from 'three';
import type { Impact } from '../attacks/AttackTypes';
import type { UrinalSurface } from './UrinalSurface';

interface Drip {
  x: number;
  y: number;
  speed: number;
  life: number;
  width: number;
  wobble: number;
}

/**
 * 便器の内壁に溜まる「濡れ・垂れ跡」（演出のみ。判定には無関係）。
 * 着弾点に淡いにじみを描き、ときどき下へ垂れる筋を伸ばす。
 * 競技の見やすさを損なわないよう、不透明度は低く抑え、予告・判定マーカーより奥に描く。
 */
export class StainLayer {
  readonly mesh: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly drips: Drip[] = [];
  private dirty = false;
  private sinceUpload = 0;
  private landings = 0;

  constructor(
    geometry: BufferGeometry,
    private readonly surface: UrinalSurface,
    private readonly bounds: { thetaD: number; yBasin: number; yTop: number },
    private size = 512,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const material = new MeshPhysicalMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.renderOrder = 1;
  }

  /** 累計の着弾数（受け皿の濁りなどに使う） */
  get totalLandings(): number {
    return this.landings;
  }

  setResolution(size: number): void {
    if (size === this.size) return;
    this.size = size;
    this.canvas.width = this.canvas.height = size;
    // サイズが変わったら GPU 側のテクスチャを作り直す（古いサイズへの部分転送エラーを防ぐ）
    this.texture.dispose();
    this.clear();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.size, this.size);
    this.drips.length = 0;
    this.landings = 0;
    this.dirty = true;
  }

  private toCanvas(u: number, v: number): { x: number; y: number } {
    const { thetaD, yBasin, yTop } = this.bounds;
    const theta = this.surface.thetaFromU(u);
    const y = this.surface.yFromV(v);
    const cu = (theta + thetaD) / (2 * thetaD);
    const cv = (y - yBasin) / (yTop - yBasin);
    return { x: cu * this.size, y: (1 - cv) * this.size };
  }

  /** メートル → キャンバスのピクセル（横方向の概算） */
  private metersToPx(m: number): number {
    const { thetaD } = this.bounds;
    const arc = (this.surface.widthM / (2 * this.surface.thetaMax)) * 2 * thetaD;
    return (m / arc) * this.size;
  }

  add(impact: Impact): void {
    this.landings += 1;
    const isStream = impact.kind === 'stream';
    // 尿流は着弾数が多いので間引いて描く
    if (isStream && Math.random() > 0.35) return;
    const { x, y } = this.toCanvas(impact.u, impact.v);
    const r = this.metersToPx(impact.radius) * (isStream ? 1.1 : 1.3);
    this.blot(x, y, r, isStream ? 0.07 : 0.12);
    if (Math.random() < (isStream ? 0.05 : 0.3)) this.spawnDrip(x, y + r * 0.4, r);
  }

  /** 的への命中など、大きな汚れ */
  splash(u: number, v: number, radiusM: number): void {
    const { x, y } = this.toCanvas(u, v);
    const r = this.metersToPx(radiusM) * 2.5;
    this.blot(x, y, r, 0.22);
    for (let i = 0; i < 5; i++) this.spawnDrip(x + (Math.random() - 0.5) * r, y + r * 0.3, r * 0.6);
  }

  private blot(x: number, y: number, r: number, alpha: number): void {
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(205, 158, 32, ${alpha})`);
    g.addColorStop(0.6, `rgba(214, 172, 46, ${alpha * 0.6})`);
    g.addColorStop(1, 'rgba(220, 180, 60, 0)');
    this.ctx.fillStyle = g;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.dirty = true;
  }

  private spawnDrip(x: number, y: number, r: number): void {
    if (this.drips.length > 60) return;
    this.drips.push({
      x,
      y,
      speed: this.size * (0.05 + Math.random() * 0.08),
      life: 0.8 + Math.random() * 1.6,
      width: Math.max(1, r * (0.12 + Math.random() * 0.12)),
      wobble: Math.random() * 10,
    });
  }

  update(dt: number): void {
    if (this.drips.length > 0) {
      const ctx = this.ctx;
      ctx.lineCap = 'round';
      for (let i = this.drips.length - 1; i >= 0; i--) {
        const d = this.drips[i];
        const x0 = d.x;
        const y0 = d.y;
        d.y += d.speed * dt;
        d.x += Math.sin(d.y * 0.08 + d.wobble) * 0.15;
        d.speed *= Math.max(0, 1 - dt * 0.7);
        d.life -= dt;
        ctx.strokeStyle = 'rgba(200, 152, 30, 0.07)';
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
        if (d.life <= 0 || d.y > this.size || d.speed < 2) {
          // 垂れの終わりは小さな玉
          ctx.fillStyle = 'rgba(200, 152, 30, 0.1)';
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.width * 0.9, 0, Math.PI * 2);
          ctx.fill();
          this.drips.splice(i, 1);
        }
      }
      this.dirty = true;
    }
    // テクスチャの転送は最大 15 回/秒
    this.sinceUpload += dt;
    if (this.dirty && this.sinceUpload >= 1 / 15) {
      this.texture.needsUpdate = true;
      this.dirty = false;
      this.sinceUpload = 0;
    }
  }

  dispose(): void {
    this.texture.dispose();
    (this.mesh.material as MeshPhysicalMaterial).dispose();
  }
}
