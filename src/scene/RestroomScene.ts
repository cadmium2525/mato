import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Shape,
  ShapeGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { tileTexture } from './textures';
import { UrinalSurface } from './UrinalSurface';

/** (nu+1)×(nv+1) の格子からメッシュを作る */
function gridGeometry(nu: number, nv: number, fn: (a: number, b: number, out: Vector3) => void): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const p = new Vector3();
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      fn(i / nu, j / nv, p);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export class RestroomScene {
  readonly scene = new Scene();
  readonly surface = new UrinalSurface();
  /** プレイ対象の便器（中央） */
  readonly urinal: Group;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(renderer: WebGLRenderer, private readonly lowQuality = false) {
    this.scene.background = new Color(0xc9d0d4);
    this.scene.fog = new Fog(0xc9d0d4, 6, 14);

    const pmrem = new PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.disposables.push(env);

    this.buildLights();
    this.buildRoom();
    this.urinal = this.buildUrinal();
    this.scene.add(this.urinal);
    // 隣の便器（飾り）
    for (const x of [-0.95, 0.95]) {
      const u = this.urinal.clone();
      u.position.x = x;
      this.scene.add(u);
    }
    this.buildPartitions();
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private buildLights(): void {
    this.scene.add(new HemisphereLight(0xf4f8ff, 0x5d656b, 0.55));

    const spot = new SpotLight(0xf2f7ff, 28, 6, Math.PI / 5, 0.6, 1.4);
    spot.position.set(0.25, 2.55, 1.35);
    spot.target.position.set(0, 0.75, 0.15);
    spot.castShadow = !this.lowQuality;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    this.scene.add(spot, spot.target);

    const fill = new DirectionalLight(0xdfe8ff, 0.6);
    fill.position.set(-2, 2.4, 3);
    this.scene.add(fill);
  }

  private buildRoom(): void {
    const wallTex = this.track(tileTexture('#eef1f2', '#b9c1c5', 8, 10, 3.4));
    const floorTex = this.track(tileTexture('#8d969b', '#5f676b', 4, 18, 12));

    const floor = new Mesh(
      this.track(new PlaneGeometry(9, 6)),
      this.track(new MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.0 })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0.5, 0, 3);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMat = this.track(new MeshStandardMaterial({ map: wallTex, roughness: 0.35 }));
    const back = new Mesh(this.track(new PlaneGeometry(9, 2.8)), wallMat);
    back.position.set(0.5, 1.4, 0);
    back.receiveShadow = true;
    this.scene.add(back);

    const left = new Mesh(this.track(new PlaneGeometry(6, 2.8)), wallMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-2.2, 1.4, 3);
    this.scene.add(left);

    const ceiling = new Mesh(
      this.track(new PlaneGeometry(9, 6)),
      this.track(new MeshStandardMaterial({ color: 0xe8ecee, roughness: 0.9 })),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0.5, 2.8, 3);
    this.scene.add(ceiling);

    // 蛍光灯
    const tubeMat = this.track(new MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f9ff, emissiveIntensity: 2.2 }));
    const tubeGeo = this.track(new BoxGeometry(1.2, 0.04, 0.16));
    for (const [x, z] of [[0, 1.2], [2, 1.2], [0, 3.2], [2, 3.2]]) {
      const tube = new Mesh(tubeGeo, tubeMat);
      tube.position.set(x, 2.77, z);
      this.scene.add(tube);
    }

    // 巾木
    const skirting = new Mesh(
      this.track(new BoxGeometry(9, 0.1, 0.02)),
      this.track(new MeshStandardMaterial({ color: 0x5f676b, roughness: 0.6 })),
    );
    skirting.position.set(0.5, 0.05, 0.01);
    this.scene.add(skirting);
  }

  private buildPartitions(): void {
    const mat = this.track(new MeshStandardMaterial({ color: 0x8ea2ad, roughness: 0.4, metalness: 0.1 }));
    const geo = this.track(new BoxGeometry(0.025, 0.9, 0.48));
    for (const x of [-1.42, -0.48, 0.48, 1.42]) {
      const p = new Mesh(geo, mat);
      p.position.set(x, 1.12, 0.26);
      p.castShadow = !this.lowQuality;
      this.scene.add(p);
    }
  }

  private buildUrinal(): Group {
    const s = this.surface;
    const { radiusX: rx, radiusZ: rz, centerZ: cz } = s.params;
    const group = new Group();
    const ceramic = this.track(
      new MeshPhysicalMaterial({
        color: 0xf6f8f8,
        roughness: 0.18,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        side: DoubleSide,
      }),
    );

    const thetaD = s.thetaMax + 0.5;
    const yBasin = 0.47;
    const yTop = 1.1;
    const t = 0.035; // 肉厚
    const yBottomOuter = 0.36;
    const yTopOuter = 1.13;

    const pointOn = (theta: number, y: number, grow: number, out: Vector3): Vector3 =>
      out.set((rx + grow) * Math.sin(theta), y, cz - (rz + grow) * Math.cos(theta));

    const inner = gridGeometry(64, 24, (a, b, out) => {
      const theta = -thetaD + a * 2 * thetaD;
      // 上部はわずかに外へ反らせる
      const y = yBasin + b * (yTop - yBasin);
      const flare = Math.max(0, b - 0.85) * 0.05;
      pointOn(theta, y, flare, out);
    });
    const outer = gridGeometry(64, 8, (a, b, out) => {
      pointOn(-thetaD + a * 2 * thetaD, yBottomOuter + b * (yTopOuter - yBottomOuter), t, out);
    });
    const rim = gridGeometry(64, 2, (a, b, out) => {
      const theta = -thetaD + a * 2 * thetaD;
      const innerP = pointOn(theta, yTop, 0.0075, new Vector3());
      const outerP = pointOn(theta, yTopOuter, t, new Vector3());
      out.lerpVectors(innerP, outerP, b);
      out.y += Math.sin(b * Math.PI) * 0.008;
    });
    const sides = [-thetaD, thetaD].map((theta) =>
      gridGeometry(2, 8, (a, b, out) => {
        const y = yBottomOuter + b * (yTopOuter - yBottomOuter);
        const innerP = pointOn(theta, Math.min(y, yTop), 0, new Vector3());
        const outerP = pointOn(theta, y, t, new Vector3());
        out.lerpVectors(innerP, outerP, a);
      }),
    );
    // 内壁は端と下部をわずかに暗くして奥行きを出す（頂点カラー）
    const innerColors: number[] = [];
    const pos = inner.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const theta = Math.atan2(pos.getX(i) / rx, (cz - pos.getZ(i)) / rz);
      const b = (pos.getY(i) - yBasin) / (yTop - yBasin);
      const k = 1 - 0.22 * Math.pow(Math.abs(theta) / thetaD, 2) - 0.16 * Math.pow(1 - b, 3);
      innerColors.push(k, k, k * 1.01);
    }
    inner.setAttribute('color', new Float32BufferAttribute(innerColors, 3));
    const innerCeramic = this.track(ceramic.clone());
    innerCeramic.vertexColors = true;
    const innerMesh = new Mesh(this.track(inner), innerCeramic);
    innerMesh.castShadow = true;
    innerMesh.receiveShadow = true;
    group.add(innerMesh);

    for (const g of [outer, rim, ...sides]) {
      const m = new Mesh(this.track(g), ceramic);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }

    // 底（受け皿）と下面
    const halfEllipse = (grow: number): Shape => {
      const shape = new Shape();
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const theta = -thetaD + (i / n) * 2 * thetaD;
        const x = (rx + grow) * Math.sin(theta);
        const z = cz - (rz + grow) * Math.cos(theta);
        // Shape は xy 平面。回転後に y→-z となるよう -z を入れる
        if (i === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      }
      shape.closePath();
      return shape;
    };
    const basin = new Mesh(this.track(new ShapeGeometry(halfEllipse(0), 40)), ceramic);
    basin.rotation.x = -Math.PI / 2;
    basin.position.y = yBasin;
    basin.receiveShadow = true;
    group.add(basin);
    const under = new Mesh(this.track(new ShapeGeometry(halfEllipse(t), 40)), ceramic);
    under.rotation.x = -Math.PI / 2;
    under.position.y = yBottomOuter;
    group.add(under);

    // 前リップ
    const lipW = 2 * (rx + t) * Math.sin(Math.min(thetaD, Math.PI / 2));
    const lip = new Mesh(this.track(new BoxGeometry(lipW, 0.15, t)), ceramic);
    lip.position.set(0, (yBottomOuter + yBasin + 0.04) / 2, cz + t / 2 - 0.004);
    lip.castShadow = true;
    lip.receiveShadow = true;
    group.add(lip);

    // 排水口
    const drainZ = cz - rz * 0.55;
    const drain = new Mesh(
      this.track(new CircleGeometry(0.032, 32)),
      this.track(new MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.4, metalness: 0.6 })),
    );
    drain.rotation.x = -Math.PI / 2;
    drain.position.set(0, yBasin + 0.002, drainZ);
    group.add(drain);
    const chrome = this.track(new MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.12, metalness: 1 }));
    const drainRing = new Mesh(this.track(new TorusGeometry(0.034, 0.005, 8, 32)), chrome);
    drainRing.rotation.x = Math.PI / 2;
    drainRing.position.set(0, yBasin + 0.003, drainZ);
    group.add(drainRing);
    const slotMat = this.track(new MeshStandardMaterial({ color: 0x8a9095, roughness: 0.3, metalness: 0.9 }));
    const slotGeo = this.track(new BoxGeometry(0.05, 0.002, 0.004));
    for (let i = -2; i <= 2; i++) {
      const slot = new Mesh(slotGeo, slotMat);
      slot.position.set(0, yBasin + 0.004, drainZ + i * 0.011);
      group.add(slot);
    }

    // フラッシュバルブと配管
    const pipe = new Mesh(this.track(new CylinderGeometry(0.014, 0.014, 0.42, 16)), chrome);
    pipe.position.set(0, yTopOuter + 0.2, cz - rz - 0.02);
    group.add(pipe);
    const valve = new Mesh(this.track(new CylinderGeometry(0.035, 0.035, 0.11, 24)), chrome);
    valve.rotation.x = Math.PI / 2;
    valve.position.set(0, yTopOuter + 0.36, cz - rz + 0.0);
    group.add(valve);
    const sensor = new Mesh(
      this.track(new BoxGeometry(0.05, 0.03, 0.006)),
      this.track(new MeshStandardMaterial({ color: 0x111418, roughness: 0.2, metalness: 0.2 })),
    );
    sensor.position.set(0, yTopOuter + 0.36, cz - rz + 0.058);
    group.add(sensor);

    return group;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
