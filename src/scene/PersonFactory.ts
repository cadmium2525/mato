import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Material } from 'three';
import { getProfile, type EnemyKind } from '../entities/EnemyProfiles';

/** 共有ジオメトリ・マテリアル（毎回生成しない） */
const box = new BoxGeometry(1, 1, 1);
const sphere = new SphereGeometry(1, 20, 14);
const cylinder = new CylinderGeometry(1, 1, 1, 10);
const materials = new Map<number, MeshStandardMaterial>();

function mat(color: number, roughness = 0.75): Material {
  const key = color * 10 + Math.round(roughness * 9);
  let m = materials.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness });
    materials.set(key, m);
  }
  return m;
}

function part(geo: BoxGeometry | SphereGeometry | CylinderGeometry, material: Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): Mesh {
  const m = new Mesh(geo, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** ローポリの着衣人物。体格・服色・姿勢でキャラを見分けられるようにする */
export class PersonView {
  readonly root = new Group();
  private readonly upper = new Group();
  private readonly legL = new Group();
  private readonly legR = new Group();
  private readonly armL = new Group();
  private readonly armR = new Group();
  private walkPhase = 0;
  private time = Math.random() * 10;
  private readonly baseStoop: number;

  constructor(readonly kind: EnemyKind) {
    const { look } = getProfile(kind);
    const s = look.height / 1.72;
    const b = look.build;
    const muscle = kind === 'muscle';
    const hipY = 0.84 * s;
    this.baseStoop = look.stoop;

    // 脚
    for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
      leg.position.set(side * 0.085 * b, hipY, 0);
      leg.add(part(box, mat(look.pants), 0.14 * b, hipY - 0.06, 0.16, 0, -(hipY - 0.06) / 2, 0));
      leg.add(part(box, mat(0x161616, 0.4), 0.14 * b, 0.07, 0.27, 0, -hipY + 0.035, 0.05));
      this.root.add(leg);
    }

    // 上半身（腰を支点に前傾できる）
    this.upper.position.y = hipY;
    this.root.add(this.upper);
    const torsoH = 0.6 * s;
    const torsoW = (muscle ? 0.52 : 0.42) * b;
    const torsoD = 0.24 * Math.min(b, 1.15);
    this.upper.add(part(box, mat(muscle ? look.shirt : look.jacket), torsoW, torsoH, torsoD, 0, torsoH / 2, 0));
    if (!muscle) {
      // シャツとネクタイ
      this.upper.add(part(box, mat(look.shirt), 0.13 * b, torsoH * 0.85, 0.01, 0, torsoH * 0.55, torsoD / 2 + 0.003));
      const tie = part(box, mat(look.accent, 0.5), 0.045, torsoH * 0.6, 0.012, 0, torsoH * 0.6, torsoD / 2 + 0.01);
      if (kind === 'drunk') tie.rotation.z = 0.35;
      if (kind !== 'elderly') this.upper.add(tie);
    } else {
      // 肩の盛り上がり
      for (const side of [-1, 1]) {
        this.upper.add(part(sphere, mat(look.skin, 0.6), 0.11, 0.09, 0.11, side * torsoW * 0.48, torsoH * 0.95, 0));
      }
    }

    // 腕
    const armW = muscle ? 0.16 : 0.1 * b;
    const armLen = 0.58 * s;
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(side * (torsoW / 2 + armW / 2 - (muscle ? 0.01 : -0.005)), torsoH * 0.92, 0);
      arm.add(part(box, mat(muscle ? look.skin : look.jacket, 0.65), armW, armLen, armW, 0, -armLen / 2, 0));
      arm.add(part(sphere, mat(look.skin, 0.6), 0.05, 0.055, 0.05, 0, -armLen - 0.03, 0));
      this.upper.add(arm);
    }

    // 首・頭・髪
    this.upper.add(part(box, mat(look.skin, 0.6), 0.1, 0.09, 0.1, 0, torsoH + 0.04, 0));
    const headY = torsoH + 0.17;
    this.upper.add(part(sphere, mat(look.skin, 0.6), 0.105, 0.125, 0.115, 0, headY, 0));
    if (kind === 'elderly') {
      this.upper.add(part(sphere, mat(look.hair, 0.9), 0.11, 0.08, 0.1, 0, headY - 0.01, -0.03));
    } else {
      this.upper.add(part(sphere, mat(look.hair, 0.9), 0.11, 0.1, 0.12, 0, headY + 0.04, -0.012));
    }
    // 眉/目（向きが分かる程度）
    for (const side of [-1, 1]) {
      this.upper.add(part(box, mat(0x1b1b1b, 0.5), 0.025, 0.012, 0.01, side * 0.04, headY + 0.015, 0.108));
    }
    if (kind === 'elderly') {
      // 杖
      const cane = part(cylinder, mat(0x5a3b22, 0.5), 0.012, hipY, 0.012, 0.3, hipY / 2, 0.12);
      this.root.add(cane);
    }
  }

  /** moving: 歩行アニメーション, drunkSway: ふらつき */
  update(dt: number, moving: boolean): void {
    this.time += dt;
    if (moving) this.walkPhase += dt * 9;
    const swing = moving ? Math.sin(this.walkPhase) * 0.5 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.7;
    this.armR.rotation.x = swing * 0.7;
    const breathe = Math.sin(this.time * 2) * 0.01;
    this.upper.rotation.x = this.baseStoop + breathe;
    this.upper.rotation.z = this.kind === 'drunk' ? Math.sin(this.time * 1.7) * 0.09 : 0;
    this.root.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.02 : 0;
  }
}
