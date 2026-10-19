import { PerspectiveCamera, Vector3 } from 'three';

export type ShotName = 'overview' | 'queue' | 'approach' | 'closeup' | 'title';

interface Shot {
  position: Vector3;
  target: Vector3;
}

/**
 * 名前付きショット間を補間するカメラ。
 * PLAYING 中は closeup に固定（画面の右=u+, 上=v+ になるよう正面から見る）。
 */
export class CameraDirector {
  readonly shots: Record<ShotName, Shot> = {
    title: { position: new Vector3(-0.9, 1.45, 2.4), target: new Vector3(0.3, 0.85, 0.3) },
    overview: { position: new Vector3(0, 1.25, 2.0), target: new Vector3(0, 0.8, 0.2) },
    queue: { position: new Vector3(-0.4, 1.6, 3.7), target: new Vector3(1.5, 1.0, 1.2) },
    approach: { position: new Vector3(-0.85, 1.75, 2.45), target: new Vector3(0.2, 0.95, 0.6) },
    closeup: { position: new Vector3(0, 0.79, 0.98), target: new Vector3(0, 0.79, 0.1) },
  };

  private readonly fromPos = new Vector3();
  private readonly fromTarget = new Vector3();
  private readonly currentTarget = new Vector3();
  private toShot: Shot;
  private duration = 0;
  private elapsed = 0;

  constructor(readonly camera: PerspectiveCamera) {
    this.toShot = this.shots.title;
    this.cut('title');
  }

  cut(name: ShotName): void {
    this.toShot = this.shots[name];
    this.camera.position.copy(this.toShot.position);
    this.currentTarget.copy(this.toShot.target);
    this.camera.lookAt(this.currentTarget);
    this.duration = 0;
    this.elapsed = 0;
  }

  moveTo(name: ShotName, seconds: number): void {
    this.fromPos.copy(this.camera.position);
    this.fromTarget.copy(this.currentTarget);
    this.toShot = this.shots[name];
    this.duration = Math.max(0.0001, seconds);
    this.elapsed = 0;
  }

  get isSettled(): boolean {
    return this.elapsed >= this.duration;
  }

  update(dt: number): void {
    this.elapsed += dt;
    const t = this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 1;
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    if (this.duration > 0) {
      this.camera.position.lerpVectors(this.fromPos, this.toShot.position, e);
      this.currentTarget.lerpVectors(this.fromTarget, this.toShot.target, e);
    } else {
      this.camera.position.copy(this.toShot.position);
      this.currentTarget.copy(this.toShot.target);
    }
    this.camera.lookAt(this.currentTarget);
  }
}
