import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getProfile, type EnemyKind } from '../entities/EnemyProfiles';

/*
 * 手続き的に組み立てるローポリ寄りの人物（外部モデル・素材なし）。
 * - 丸みのある胴（回転体）、肘・膝の関節を持つ手足、手・靴
 * - 顔（目・眉・鼻・口・耳）、キャラ別の髪型・服・小物
 * - 歩行（膝の曲げ・腕振り）、待機（呼吸）、小便器の前の立ちポーズ
 * 描画コストを抑えるため、同じ部位・同じ材質のパーツは1つのジオメトリに結合し、キャラ別にキャッシュする。
 */

type Vec3 = [number, number, number];

interface Part {
  geo: BufferGeometry;
  pos?: Vec3;
  rot?: Vec3;
  scale?: Vec3;
}

const geoCache = new Map<string, BufferGeometry>();
const matCache = new Map<string, Material>();
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/** 部品を1つのジオメトリに結合（key でキャッシュ） */
function merged(key: string, build: () => Part[]): BufferGeometry {
  let g = geoCache.get(key);
  if (g) return g;
  const parts = build().map((p) => {
    const geo = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    // 結合するために属性をそろえる
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    _p.set(...(p.pos ?? [0, 0, 0]));
    _q.setFromEuler(_e.set(...(p.rot ?? [0, 0, 0])));
    _s.set(...(p.scale ?? [1, 1, 1]));
    geo.applyMatrix4(_m.compose(_p, _q, _s));
    p.geo.dispose();
    return geo;
  });
  g = mergeGeometries(parts, false) ?? parts[0];
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

const capsule = (r: number, len: number, seg = 10): BufferGeometry => new CapsuleGeometry(r, Math.max(0.001, len), 4, seg);

/**
 * 手足（回転体）。上端 y=0 から下へ len。r0=付け根、r1=ふくらみ（belly の位置）、r2=先端。
 * 円柱ではなく筋肉のふくらみと先細りがあるので「ソーセージ」に見えない
 */
function limb(len: number, r0: number, r1: number, r2: number, belly = 0.35, seg = 14): BufferGeometry {
  const pts: Vector2[] = [new Vector2(0, r0 * 0.55)];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const lin = r0 + (r2 - r0) * t;
    const bump = Math.max(0, Math.sin(Math.PI * Math.min(1, t / (2 * belly)) * 1)) * (r1 - (r0 + (r2 - r0) * belly));
    const r = Math.max(0.004, lin + (t < 2 * belly ? bump : 0));
    // 端は丸める
    const capTop = i === 0 ? 0.82 : 1;
    const capBottom = i === n ? 0.82 : 1;
    pts.push(new Vector2(r * capTop * capBottom, -t * len));
  }
  pts.push(new Vector2(0, -len - r2 * 0.55));
  // LatheGeometry は下→上の順で外向きの面になる
  return new LatheGeometry(pts.reverse(), seg);
}
const sphere = (r: number, w = 16, h = 12): BufferGeometry => new SphereGeometry(r, w, h);
const box = (x: number, y: number, z: number): BufferGeometry => new BoxGeometry(x, y, z);
const cyl = (rt: number, rb: number, h: number, seg = 16): BufferGeometry => new CylinderGeometry(rt, rb, h, seg);

function mat(key: string, make: () => Material): Material {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

const skinMat = (c: number): Material =>
  mat(`skin${c}`, () => new MeshPhysicalMaterial({ color: c, roughness: 0.55, sheen: 0.4, sheenColor: new Color(0xff9a8a), sheenRoughness: 0.6 }));
const clothMat = (c: number, roughness = 0.82): Material =>
  mat(`cloth${c}-${roughness}`, () => new MeshPhysicalMaterial({ color: c, roughness, sheen: 0.5, sheenColor: new Color(c).lerp(new Color(0xffffff), 0.35), sheenRoughness: 0.8 }));
const plainMat = (c: number, roughness = 0.6, metalness = 0): Material =>
  mat(`plain${c}-${roughness}-${metalness}`, () => new MeshStandardMaterial({ color: c, roughness, metalness }));

/** 頭の輪郭（上→下）。頭と髪の両方で使う */
const HEAD_PROFILE: Array<[number, number]> = [
  [0, 0.122],
  [0.045, 0.117],
  [0.075, 0.1],
  [0.093, 0.068],
  [0.099, 0.03],
  [0.098, -0.005],
  [0.092, -0.04],
  [0.08, -0.07],
  [0.06, -0.095],
  [0.034, -0.11],
  [0, -0.114],
];
const HEAD_SCALE: Vec3 = [0.95, 1, 1.03];

function headRadiusAt(y: number): number {
  for (let i = 1; i < HEAD_PROFILE.length; i++) {
    const [r0, y0] = HEAD_PROFILE[i - 1];
    const [r1, y1] = HEAD_PROFILE[i];
    if (y <= y0 && y >= y1) return r0 + ((y0 - y) / (y0 - y1)) * (r1 - r0);
  }
  return 0;
}

/**
 * 髪の殻: 頭と同じ輪郭を grow 倍に広げ、生え際の高さを向きで変える（前は front、後ろは back）。
 * 頭を必ず外側から覆うので、髪が頭に埋もれてハゲに見えることがない
 */
function hairShell(grow: number, front: number, back: number, rows = 14, seg = 28): BufferGeometry {
  const pts: Vector2[] = [];
  for (let i = rows; i >= 0; i--) {
    const y = back + (0.122 - back) * (i / rows);
    pts.push(new Vector2(headRadiusAt(Math.min(0.122, y)) * grow, y * (1 + (grow - 1) * 0.6)));
  }
  // 下→上の順で外向きの面になる
  const g = new LatheGeometry(pts.reverse(), seg);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const len = Math.hypot(x, z);
    // 前(+z)ほど生え際が高い
    const facing = len > 1e-6 ? z / len : 0;
    const line = back + (front - back) * Math.pow((facing + 1) / 2, 1.6);
    if (y < line) {
      const r = headRadiusAt(line) * grow;
      const k = len > 1e-6 ? r / len : 0;
      pos.setXYZ(i, x * k, line * (1 + (grow - 1) * 0.6), z * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

interface Style {
  hair: 'side' | 'messy' | 'bald' | 'buzz';
  top: 'suit' | 'openSuit' | 'cardigan' | 'tank';
  glasses: 'none' | 'reading' | 'sun';
  shoulder: number;
  chest: number;
  armR: number;
  legR: number;
  /** 歩幅・腕振りの大きさ */
  stride: number;
  /** 歩行の速さ */
  cadence: number;
}

const STYLES: Record<EnemyKind, Style> = {
  salaryman: { hair: 'side', top: 'suit', glasses: 'none', shoulder: 0.2, chest: 0.19, armR: 0.048, legR: 0.07, stride: 1, cadence: 1 },
  drunk: { hair: 'messy', top: 'openSuit', glasses: 'none', shoulder: 0.2, chest: 0.2, armR: 0.05, legR: 0.072, stride: 0.9, cadence: 0.9 },
  elderly: { hair: 'bald', top: 'cardigan', glasses: 'reading', shoulder: 0.185, chest: 0.18, armR: 0.045, legR: 0.064, stride: 0.6, cadence: 0.75 },
  muscle: { hair: 'buzz', top: 'tank', glasses: 'sun', shoulder: 0.25, chest: 0.235, armR: 0.072, legR: 0.085, stride: 1.05, cadence: 1 },
};

// 体の寸法（身長 1.72m 基準。全体を height/1.72 で拡大縮小する）
const HIP_Y = 0.86;
const THIGH = 0.41;
const SHIN = 0.4;
const WAIST = 0.04;
const TORSO = 0.53;
const UPPER_ARM = 0.29;
const FOREARM = 0.26;

export type PersonPose = 'stand' | 'urinal';

export class PersonView {
  readonly root = new Group();
  private readonly hips = new Group();
  private readonly spine = new Group();
  private readonly head = new Group();
  private readonly thigh: [Group, Group] = [new Group(), new Group()];
  private readonly knee: [Group, Group] = [new Group(), new Group()];
  private readonly shoulder: [Group, Group] = [new Group(), new Group()];
  private readonly elbow: [Group, Group] = [new Group(), new Group()];
  private readonly style: Style;
  private readonly stoop: number;
  private walkPhase = 0;
  private time = Math.random() * 10;
  private pose: PersonPose = 'stand';
  /** 0=立ち、1=小便器ポーズ（なめらかに補間） */
  private poseBlend = 0;
  private walkBlend = 0;

  constructor(readonly kind: EnemyKind) {
    const { look } = getProfile(kind);
    this.style = STYLES[kind];
    this.stoop = look.stoop;
    const st = this.style;
    const b = look.build;

    this.root.scale.setScalar(look.height / 1.72);
    this.root.add(this.hips);
    this.hips.position.y = HIP_Y;
    this.buildLegs(look.pants, st, b);
    this.buildTorso(look, st, b);
    this.buildArms(look, st, b);
    this.buildHead(look, st);
    if (kind === 'elderly') this.buildCane();

    this.root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        const mesh = o as Mesh;
        // 顔の小物などは影を落とさない（影マップの負荷軽減）
        mesh.castShadow = !mesh.userData.noShadow;
      }
    });
  }

  private mesh(geo: BufferGeometry, material: Material, parent: Group, noShadow = false): Mesh {
    const m = new Mesh(geo, material);
    m.userData.noShadow = noShadow;
    parent.add(m);
    return m;
  }

  // ------------------------------------------------------------ build

  private buildLegs(pants: number, st: Style, b: number): void {
    const k = this.kind;
    const r = st.legR * b;
    // 骨盤
    this.mesh(merged(`pelvis-${k}`, () => [{ geo: sphere(1, 20, 14), scale: [0.165 * b, 0.12, 0.115 * b] }]), clothMat(pants, 0.85), this.hips);
    // ズボン: 太ももは付け根が太く膝へ細く、すねはふくらはぎが少しふくらむ
    const thighGeo = merged(`thigh-${k}`, () => [
      { geo: limb(THIGH, r * 1.08, r * 1.12, r * 0.82, 0.25), scale: [1, 1, 1.05] },
      { geo: sphere(r * 0.66, 12, 10), pos: [0, -THIGH, 0] },
    ]);
    const shinGeo = merged(`shin-${k}`, () => [
      { geo: limb(SHIN, r * 0.82, r * 0.86, r * 0.7, 0.3) },
      // 裾は少し広がる
      { geo: cyl(r * 0.74, r * 0.84, 0.06, 16), pos: [0, -SHIN + 0.04, 0] },
    ]);
    const shoeGeo = merged('shoe', () => [
      { geo: capsule(0.042, 0.16, 8), rot: [Math.PI / 2, 0, 0], pos: [0, -0.03, 0.045], scale: [1, 1, 0.72] },
      { geo: box(0.085, 0.018, 0.25), pos: [0, -0.062, 0.045] },
    ]);
    const shoeMat = plainMat(0x16130f, 0.35, 0.1);
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? -1 : 1;
      const t = this.thigh[side];
      t.position.set(sx * 0.09 * b, -0.02, 0);
      this.hips.add(t);
      this.mesh(thighGeo, clothMat(pants, 0.85), t);
      const kn = this.knee[side];
      kn.position.y = -THIGH;
      t.add(kn);
      this.mesh(shinGeo, clothMat(pants, 0.85), kn);
      const foot = new Group();
      foot.position.y = -SHIN;
      kn.add(foot);
      this.mesh(shoeGeo, shoeMat, foot);
    }
  }

  private buildTorso(look: ReturnType<typeof getProfile>['look'], st: Style, b: number): void {
    const k = this.kind;
    this.spine.position.y = WAIST;
    this.hips.add(this.spine);
    const sh = st.shoulder;
    const ch = st.chest;
    // 回転体の胴（腰→胸→肩→首の付け根）。前後は平たくつぶす
    const profile = [
      [0.0, 0],
      [0.155, 0],
      [0.16, 0.08],
      [ch * 0.9, 0.2],
      [ch, 0.32],
      [sh, 0.43],
      [sh * 0.96, 0.48],
      [sh * 0.72, 0.515],
      [0.07, 0.53],
      [0.0, 0.535],
    ].map(([x, y]) => new Vector2(x, y));
    const torsoGeo = merged(`torso-${k}`, () => [{ geo: new LatheGeometry(profile, 28), scale: [b, 1, 0.62 * b] }]);
    const front = (y: number): number => {
      // 胴の前面の z（おおよそ）
      const r = y < 0.2 ? 0.16 : y < 0.32 ? ch * 0.9 + ((y - 0.2) / 0.12) * (ch - ch * 0.9) : y < 0.43 ? ch + ((y - 0.32) / 0.11) * (sh - ch) : sh * 0.9;
      return r * 0.62 * b;
    };

    if (st.top === 'tank') {
      // タンクトップ: 胴は服の色、肩・胸上部・僧帽筋は肌
      this.mesh(torsoGeo, clothMat(look.shirt, 0.9), this.spine);
      this.mesh(
        merged(`tankSkin-${k}`, () => [
          { geo: sphere(1, 18, 12), pos: [0, 0.5, 0.0], scale: [0.11 * b, 0.07, 0.09 * b] },
          // 僧帽筋（首から肩への盛り上がり）
          { geo: sphere(1, 16, 12), pos: [-0.075 * b, 0.51, -0.015], scale: [0.085, 0.045, 0.065], rot: [0, 0, -0.35] },
          { geo: sphere(1, 16, 12), pos: [0.075 * b, 0.51, -0.015], scale: [0.085, 0.045, 0.065], rot: [0, 0, 0.35] },
        ]),
        skinMat(look.skin),
        this.spine,
      );
      // 胸の盛り上がり
      this.mesh(
        merged(`pecs-${k}`, () => [
          { geo: sphere(1, 16, 12), pos: [-0.066 * b, 0.37, front(0.37) - 0.035], scale: [0.08, 0.055, 0.04] },
          { geo: sphere(1, 16, 12), pos: [0.066 * b, 0.37, front(0.37) - 0.035], scale: [0.08, 0.055, 0.04] },
        ]),
        clothMat(look.shirt, 0.9),
        this.spine,
      );
    } else {
      const jacket = look.jacket;
      this.mesh(torsoGeo, clothMat(jacket, st.top === 'cardigan' ? 0.95 : 0.7), this.spine);
      // シャツの V ゾーン（胸の前面に沿うよう少し傾ける）
      const vw = st.top === 'openSuit' ? 0.085 : st.top === 'cardigan' ? 0.06 : 0.055;
      const vBottom = st.top === 'openSuit' ? 0.2 : st.top === 'cardigan' ? 0.3 : 0.31;
      const vShape = new Shape([new Vector2(-vw, 0.525), new Vector2(vw, 0.525), new Vector2(0, vBottom)]);
      const vz = front((0.52 + vBottom) / 2) + 0.004;
      const tilt = Math.atan2(front(vBottom) - front(0.5), 0.52 - vBottom) * 0.8;
      const shirtV = this.mesh(merged(`shirtV-${k}`, () => [{ geo: new ShapeGeometry(vShape) }]), clothMat(look.shirt, 0.75), this.spine, true);
      shirtV.position.set(0, 0, vz - 0.008);
      shirtV.rotation.x = -tilt;
      // 襟（ラペル）: V の両縁に沿う、少し濃い色の帯
      if (st.top !== 'cardigan') {
        const lapel = (sx: number): Shape =>
          new Shape([
            new Vector2(sx * vw, 0.525),
            new Vector2(sx * (vw + 0.045), 0.5),
            new Vector2(sx * 0.03, vBottom - 0.01),
            new Vector2(sx * 0.004, vBottom + 0.01),
          ]);
        const lapels = this.mesh(
          merged(`lapels-${k}`, () => [{ geo: new ShapeGeometry(lapel(-1)) }, { geo: new ShapeGeometry(lapel(1)) }]),
          clothMat(new Color(jacket).multiplyScalar(0.8).getHex(), 0.6),
          this.spine,
          true,
        );
        lapels.position.set(0, 0, vz - 0.002);
        lapels.rotation.x = -tilt;
      }
      // ネクタイ
      if (st.top === 'suit' || st.top === 'openSuit') {
        const tie = new Shape([
          new Vector2(-0.016, 0.52),
          new Vector2(0.016, 0.52),
          new Vector2(0.024, 0.36),
          new Vector2(0, 0.32),
          new Vector2(-0.024, 0.36),
        ]);
        const tieMesh = this.mesh(merged('tie', () => [{ geo: new ShapeGeometry(tie) }]), clothMat(look.accent, 0.5), this.spine, true);
        tieMesh.position.set(st.top === 'openSuit' ? 0.012 : 0, st.top === 'openSuit' ? -0.03 : 0, vz - 0.004);
        tieMesh.rotation.set(-tilt, 0, st.top === 'openSuit' ? 0.22 : 0);
      }
      // ボタン
      const buttons: Part[] = [];
      const ys = st.top === 'cardigan' ? [0.27, 0.2, 0.13, 0.06] : st.top === 'suit' ? [0.24, 0.14] : [];
      for (const y of ys) buttons.push({ geo: sphere(0.009, 8, 6), pos: [0, y, front(y) + 0.002] });
      if (buttons.length) this.mesh(merged(`buttons-${k}`, () => buttons), plainMat(st.top === 'cardigan' ? 0x5b4632 : 0x1a1a1a, 0.4), this.spine, true);
      // 襟（シャツの襟を首元に）
      this.mesh(
        merged(`collar-${k}`, () => [{ geo: new TorusGeometry(0.06, 0.012, 6, 18), rot: [Math.PI / 2 + 0.25, 0, 0], pos: [0, 0.535, 0.005], scale: [1, 1, 0.9] }]),
        clothMat(look.shirt, 0.75),
        this.spine,
        true,
      );
    }
    // ベルト
    if (st.top !== 'cardigan') {
      this.mesh(
        merged(`belt-${k}`, () => [
          { geo: cyl(0.159, 0.159, 0.035, 24), pos: [0, 0.015, 0], scale: [b, 1, 0.64 * b] },
          { geo: box(0.04, 0.03, 0.01), pos: [0, 0.015, 0.103 * b] },
        ]),
        plainMat(0x1d1a17, 0.45, 0.2),
        this.spine,
        true,
      );
    }
    // 首
    this.mesh(merged(`neck-${k}`, () => [{ geo: cyl(0.052, 0.058, 0.08, 14), pos: [0, TORSO + 0.03, 0] }]), skinMat(look.skin), this.spine);
  }

  private buildArms(look: ReturnType<typeof getProfile>['look'], st: Style, b: number): void {
    const k = this.kind;
    const bare = st.top === 'tank';
    const sleeve = bare ? skinMat(look.skin) : clothMat(look.jacket, st.top === 'cardigan' ? 0.95 : 0.7);
    const r = st.armR * (bare ? 1 : b);
    const upperGeo = merged(`upper-${k}`, () => [
      // 肩（三角筋）から上腕二頭筋のふくらみ、肘へ細く
      bare ? { geo: limb(UPPER_ARM, r * 1.05, r * 1.18, r * 0.72, 0.4), scale: [1, 1, 0.95] } : { geo: limb(UPPER_ARM, r * 1.05, r * 1.02, r * 0.85, 0.3) },
      { geo: sphere(r * (bare ? 0.58 : 0.68), 12, 10), pos: [0, -UPPER_ARM, 0] },
      { geo: sphere(r * 0.9, 14, 10), pos: [0, -0.012, 0] },
    ]);
    const foreGeo = merged(`fore-${k}`, () => [
      bare ? { geo: limb(FOREARM, r * 0.78, r * 0.92, r * 0.5, 0.22) } : { geo: limb(FOREARM, r * 0.85, r * 0.86, r * 0.72, 0.3) },
    ]);
    const cuffGeo = merged(`cuff-${k}`, () => [{ geo: cyl(r * 0.9, r * 0.9, 0.025, 12), pos: [0, -FOREARM + 0.03, 0] }]);
    const handGeo = merged('hand', () => [
      { geo: sphere(1, 12, 10), pos: [0, -0.05, 0], scale: [0.034, 0.055, 0.022] },
      { geo: capsule(0.011, 0.03, 6), pos: [0.026, -0.04, 0.012], rot: [0, 0, 0.5] },
    ]);
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? -1 : 1;
      const s = this.shoulder[side];
      s.position.set(sx * (st.shoulder * b - r * 0.6), 0.462, 0);
      this.spine.add(s);
      this.mesh(upperGeo, sleeve, s);
      const e = this.elbow[side];
      e.position.y = -UPPER_ARM;
      s.add(e);
      this.mesh(foreGeo, sleeve, e);
      if (!bare) this.mesh(cuffGeo, clothMat(look.shirt, 0.75), e, true);
      const hand = this.mesh(handGeo, skinMat(look.skin), e);
      hand.position.y = -FOREARM;
      hand.scale.x = sx;
    }
  }

  private buildHead(look: ReturnType<typeof getProfile>['look'], st: Style): void {
    const k = this.kind;
    this.head.position.y = TORSO + 0.06;
    this.spine.add(this.head);
    const cy = 0.11;
    const skin = skinMat(look.skin);
    // 頭・あご・耳・鼻（同じ肌の材質なので1つに結合）
    this.mesh(
      merged(`headSkin-${k}`, () => [
        // 卵形の頭（あごへ向かって細くなる回転体。球を重ねたときの継ぎ目が出ない）
        {
          geo: new LatheGeometry(
            [...HEAD_PROFILE]
              .reverse() // 下→上の順で外向きの面になる
              .map(([x, y]) => new Vector2(x, y)),
            28,
          ),
          pos: [0, cy, 0],
          scale: HEAD_SCALE,
        },
        { geo: sphere(0.022, 10, 8), pos: [-0.097, cy, -0.004], scale: [0.45, 1, 0.75] },
        { geo: sphere(0.022, 10, 8), pos: [0.097, cy, -0.004], scale: [0.45, 1, 0.75] },
        { geo: sphere(0.016, 10, 8), pos: [0, cy - 0.006, 0.1], scale: [0.8, 1.15, 1.2] },
      ]),
      skin,
      this.head,
    );
    // 目（白目＋黒目）
    this.mesh(
      merged('eyeWhite', () => [
        { geo: sphere(0.013, 12, 10), pos: [-0.034, cy + 0.012, 0.087], scale: [1.2, 0.82, 0.62] },
        { geo: sphere(0.013, 12, 10), pos: [0.034, cy + 0.012, 0.087], scale: [1.2, 0.82, 0.62] },
      ]),
      plainMat(0xf4f1ea, 0.25),
      this.head,
      true,
    );
    this.mesh(
      merged('iris', () => [
        { geo: sphere(0.0064, 10, 8), pos: [-0.033, cy + 0.011, 0.0925], scale: [1, 1, 0.6] },
        { geo: sphere(0.0064, 10, 8), pos: [0.033, cy + 0.011, 0.0925], scale: [1, 1, 0.6] },
      ]),
      plainMat(0x1d140e, 0.15),
      this.head,
      true,
    );
    // 眉・口
    const browTilt = k === 'drunk' ? 0.25 : k === 'muscle' ? -0.2 : 0.08;
    this.mesh(
      merged(`brows-${k}`, () => [
        { geo: box(0.032, 0.0065, 0.008), pos: [-0.036, cy + 0.036, 0.092], rot: [0, 0, browTilt] },
        { geo: box(0.032, 0.0065, 0.008), pos: [0.036, cy + 0.036, 0.092], rot: [0, 0, -browTilt] },
      ]),
      plainMat(k === 'elderly' ? 0xd8d8d8 : look.hair, 0.8),
      this.head,
      true,
    );
    const mouthW = k === 'drunk' ? 0.04 : 0.032;
    this.mesh(
      merged(`mouth-${k}`, () => [{ geo: box(mouthW, 0.0055, 0.006), pos: [0, cy - 0.047, 0.09], rot: [0, 0, k === 'drunk' ? -0.12 : 0] }]),
      plainMat(0x7a3b34, 0.5),
      this.head,
      true,
    );
    // 酔っ払いの赤ら顔
    if (k === 'drunk') {
      this.mesh(
        merged('cheeks', () => [
          { geo: sphere(0.018, 10, 8), pos: [-0.052, cy - 0.015, 0.078], scale: [1, 0.7, 0.4] },
          { geo: sphere(0.018, 10, 8), pos: [0.052, cy - 0.015, 0.078], scale: [1, 0.7, 0.4] },
          { geo: sphere(0.012, 8, 6), pos: [0, cy - 0.004, 0.113], scale: [1, 1, 0.6] },
        ]),
        plainMat(0xe0525a, 0.6),
        this.head,
        true,
      );
    }
    // 髪
    const hairMat = plainMat(look.hair, 0.7);

    if (st.hair === 'side') {
      this.mesh(
        merged('hairSide', () => [
          { geo: hairShell(1.08, 0.068, -0.075), pos: [0, cy, 0], scale: HEAD_SCALE },
          // 七三分けの前髪（薄く流す）
          { geo: capsule(0.012, 0.06, 6), pos: [0.025, cy + 0.085, 0.072], rot: [0.5, 0, Math.PI / 2 - 0.3], scale: [1, 1, 0.45] },
        ]),
        hairMat,
        this.head,
      );
    } else if (st.hair === 'messy') {
      const tufts: Part[] = [
        { geo: hairShell(1.1, 0.072, -0.07), pos: [0, cy, 0], scale: HEAD_SCALE, rot: [0, 0, 0.05] },
      ];
      const spots: Vec3[] = [
        [0.04, cy + 0.118, 0.02],
        [-0.05, cy + 0.11, -0.005],
        [0.0, cy + 0.122, -0.04],
        [0.08, cy + 0.08, -0.02],
        [-0.085, cy + 0.07, 0.025],
        [0.02, cy + 0.1, 0.07],
      ];
      for (const [x, y, z] of spots) tufts.push({ geo: sphere(0.026, 8, 6), pos: [x, y, z], scale: [1, 0.7, 1.2], rot: [x * 6, 0, z * 8] });
      this.mesh(merged('hairMessy', () => tufts), hairMat, this.head);
    } else if (st.hair === 'bald') {
      // 側頭部と後頭部だけ残る白髪＋口ひげ
      this.mesh(
        merged('hairBald', () => [
          // 耳の高さで後ろ半分だけ（前は開いている）
          { geo: new TorusGeometry(0.092, 0.024, 8, 24, Math.PI * 1.1), rot: [Math.PI / 2, 0, Math.PI * 0.95], pos: [0, cy - 0.004, -0.018], scale: [1, 1.1, 1] },
          { geo: capsule(0.009, 0.035, 6), pos: [0, cy - 0.032, 0.098], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.8] },
        ]),
        hairMat,
        this.head,
      );
    } else {
      this.mesh(
        merged('hairBuzz', () => [
          { geo: hairShell(1.035, 0.078, -0.05), pos: [0, cy, 0], scale: HEAD_SCALE },
        ]),
        hairMat,
        this.head,
      );
    }
    // 眼鏡
    if (st.glasses === 'reading') {
      this.mesh(
        merged('readingGlasses', () => [
          { geo: new TorusGeometry(0.019, 0.0025, 6, 18), pos: [-0.035, cy + 0.011, 0.1] },
          { geo: new TorusGeometry(0.019, 0.0025, 6, 18), pos: [0.035, cy + 0.011, 0.1] },
          { geo: box(0.03, 0.003, 0.003), pos: [0, cy + 0.016, 0.102] },
          { geo: box(0.003, 0.003, 0.09), pos: [-0.092, cy + 0.014, 0.055] },
          { geo: box(0.003, 0.003, 0.09), pos: [0.092, cy + 0.014, 0.055] },
        ]),
        plainMat(0x8a6a2a, 0.3, 0.8),
        this.head,
        true,
      );
    } else if (st.glasses === 'sun') {
      this.mesh(
        merged('sunglasses', () => [
          { geo: capsule(0.017, 0.022, 6), pos: [-0.034, cy + 0.012, 0.096], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.35] },
          { geo: capsule(0.017, 0.022, 6), pos: [0.034, cy + 0.012, 0.096], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.35] },
          { geo: box(0.02, 0.004, 0.004), pos: [0, cy + 0.018, 0.1] },
        ]),
        plainMat(0x0b0b0d, 0.1, 0.6),
        this.head,
        true,
      );
    }
  }

  private buildCane(): void {
    // 右手で持つ杖（右肘の先に付ける）
    const cane = this.mesh(
      merged('cane', () => [
        { geo: cyl(0.011, 0.011, 0.86, 8), pos: [0, -0.43, 0] },
        { geo: new TorusGeometry(0.035, 0.011, 6, 12, Math.PI), pos: [0.035, 0, 0], rot: [0, 0, 0] },
      ]),
      plainMat(0x5a3b22, 0.45),
      this.elbow[1],
    );
    cane.position.set(0, -FOREARM - 0.05, 0.02);
  }

  // ------------------------------------------------------------ animation

  setPose(pose: PersonPose): void {
    this.pose = pose;
  }

  /** moving: 歩行中か */
  update(dt: number, moving: boolean): void {
    const st = this.style;
    this.time += dt;
    this.walkBlend += ((moving ? 1 : 0) - this.walkBlend) * Math.min(1, dt * 8);
    this.poseBlend += ((this.pose === 'urinal' && !moving ? 1 : 0) - this.poseBlend) * Math.min(1, dt * 5);
    if (moving) this.walkPhase += dt * 8.5 * st.cadence;
    const w = this.walkBlend;
    const u = this.poseBlend;
    const ph = this.walkPhase;
    const t = this.time;
    const amp = st.stride;

    // 脚: 太もも前後＋膝の曲げ
    for (const side of [0, 1] as const) {
      const p = ph + (side === 0 ? 0 : Math.PI);
      const swing = -Math.sin(p) * 0.5 * amp;
      this.thigh[side].rotation.x = swing * w;
      this.knee[side].rotation.x = (0.05 + Math.max(0, Math.cos(p - 0.4)) * 0.85 * amp) * w + (1 - w) * 0.04;
      // マッチョは少しがに股
      this.thigh[side].rotation.z = (side === 0 ? -1 : 1) * (this.kind === 'muscle' ? 0.06 : 0.015);
    }
    // 体の上下動・ひねり
    this.hips.position.y = HIP_Y - 0.012 * w + Math.abs(Math.sin(ph)) * 0.018 * w * amp;
    this.hips.rotation.y = Math.sin(ph) * 0.06 * w;
    const breathe = Math.sin(t * 2.1) * 0.012;
    this.spine.rotation.y = -Math.sin(ph) * (this.kind === 'muscle' ? 0.12 : 0.07) * w;
    this.spine.rotation.x = this.stoop + breathe - (this.kind === 'muscle' ? 0.05 : 0) + u * 0.06;
    this.spine.rotation.z = this.kind === 'drunk' ? Math.sin(t * 1.7) * 0.07 + Math.sin(t * 0.6) * 0.04 : 0;

    // 腕: 歩行の腕振り / 立ち / 小便器ポーズ（手を前へ）
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? -1 : 1;
      const p = ph + (side === 0 ? Math.PI : 0);
      const walkArm = -Math.sin(p) * 0.4 * amp;
      const out = this.kind === 'muscle' ? 0.26 : 0.06;
      let sxRot = walkArm * w + 0.03 * (1 - w);
      let elbow = -0.22 - Math.max(0, -Math.sin(p)) * 0.25 * w;
      // 小便器の前では両手を前に（腰の前）
      sxRot = sxRot * (1 - u) + -0.42 * u;
      elbow = elbow * (1 - u) + -1.05 * u;
      if (this.kind === 'elderly' && side === 1) {
        // 杖を持つ右腕
        sxRot = -0.18 + walkArm * 0.3 * w;
        elbow = -0.35;
      }
      // 小便器ポーズでは手を体の中央へ寄せる（便器の側面を突き抜けない）
      this.shoulder[side].rotation.set(sxRot, 0, sx * (out * (1 - u) + Math.sin(t * 2.1) * 0.01) - sx * 0.32 * u);
      this.elbow[side].rotation.x = elbow;
    }
    // 頭: 小便器では少しうつむく。酔っ払いは揺れる、おじいちゃんは前を見ようと顔を上げる
    this.head.rotation.x = u * 0.3 - (this.kind === 'elderly' ? this.stoop * 0.8 : 0) - breathe;
    this.head.rotation.z = this.kind === 'drunk' ? Math.sin(t * 1.3 + 1) * 0.1 : 0;
    this.head.rotation.y = this.kind === 'drunk' ? Math.sin(t * 0.7) * 0.15 : Math.sin(t * 0.4) * 0.05 * (1 - u);
  }
}
