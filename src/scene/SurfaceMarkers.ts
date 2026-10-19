import { CircleGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, Vector3 } from 'three';
import { targetTexture } from './textures';
import type { UrinalSurface } from './UrinalSurface';

const tmpP = new Vector3();
const tmpN = new Vector3();

function placeOnSurface(obj: Group | Mesh, surface: UrinalSurface, u: number, v: number, offset: number): void {
  surface.surfacePoint(u, v, tmpP);
  surface.surfaceNormal(u, v, tmpN);
  obj.position.copy(tmpP).addScaledVector(tmpN, offset);
  obj.lookAt(tmpP.addScaledVector(tmpN, 1 + offset));
}

/** プレイヤーの的（赤白マーク） */
export class TargetMarker {
  readonly mesh: Mesh;
  private readonly material: MeshStandardMaterial;
  private flash = 0;

  constructor(private readonly surface: UrinalSurface, radius: number) {
    this.material = new MeshStandardMaterial({
      map: targetTexture(),
      roughness: 0.35,
      emissive: 0x330000,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new Mesh(new CircleGeometry(radius, 48), this.material);
    this.mesh.renderOrder = 2;
  }

  setPosition(u: number, v: number): void {
    placeOnSurface(this.mesh, this.surface, u, v, 0.0025);
  }

  hitFlash(): void {
    this.flash = 1;
  }

  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.material.emissive.setRGB(0.2 + this.flash * 0.8, this.flash * 0.7, 0);
    const s = 1 + this.flash * 0.25;
    this.mesh.scale.set(s, s, 1);
  }
}

/** 照準の予告リング。発射前の予備動作・再開予兆では点滅する */
export class AimRing {
  readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;
  private time = 0;

  constructor(private readonly surface: UrinalSurface, radius: number) {
    this.material = new MeshBasicMaterial({ color: 0xffc81e, transparent: true, opacity: 0.8, depthWrite: false });
    this.mesh = new Mesh(new RingGeometry(radius * 0.72, radius, 40), this.material);
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  setRadius(radius: number): void {
    this.mesh.geometry.dispose();
    this.mesh.geometry = new RingGeometry(radius * 0.72, radius, 40);
  }

  /** mode: 'warn' 点滅 / 'live' 常時表示 / 'off' 非表示 */
  update(dt: number, u: number, v: number, mode: 'warn' | 'live' | 'off'): void {
    this.time += dt;
    this.mesh.visible = mode !== 'off';
    if (mode === 'off') return;
    placeOnSurface(this.mesh, this.surface, u, v, 0.004);
    this.material.opacity = mode === 'warn' ? (Math.sin(this.time * 22) > 0 ? 0.95 : 0.25) : 0.55;
  }
}
