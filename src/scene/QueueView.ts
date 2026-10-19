import { Group, Vector3 } from 'three';
import type { QueueEntry } from '../entities/QueueManager';
import { PersonView } from './PersonFactory';

interface Tracked {
  person: PersonView;
  target: Vector3;
  facing: number;
  leaving: boolean;
}

const STAND = new Vector3(0, 0, 0.66);
const EXIT = new Vector3(-2.0, 0, 1.0);
const WALK_SPEED = 1.7;

/** 待機列の3D表示。QueueManager と同じデータ（serial）で人物を対応付ける */
export class QueueView {
  readonly group = new Group();
  private readonly tracked = new Map<number, Tracked>();
  private currentSerial: number | null = null;

  constructor(private readonly visibleSlots: number) {}

  slotPosition(index: number): Vector3 {
    return new Vector3(0.9 + index * 0.62, 0, 1.38);
  }

  /** 現在の相手と待機列を同期する。列に居ない人は出口へ歩かせる */
  sync(current: QueueEntry | null, upcoming: readonly QueueEntry[]): void {
    const keep = new Set<number>();
    if (current) {
      keep.add(current.serial);
      const t = this.ensure(current, STAND);
      t.target.copy(STAND);
      t.facing = Math.PI; // 壁（-z）を向く
      t.leaving = false;
    }
    this.currentSerial = current?.serial ?? null;
    upcoming.slice(0, this.visibleSlots).forEach((entry, i) => {
      keep.add(entry.serial);
      const pos = this.slotPosition(i);
      const t = this.ensure(entry, this.slotPosition(i + 1));
      t.target.copy(pos);
      t.facing = -Math.PI / 2; // 便器の方（-x）を向く
    });
    for (const [serial, t] of this.tracked) {
      if (!keep.has(serial) && !t.leaving) {
        t.leaving = true;
        t.target.copy(EXIT);
        t.person.root.visible = true;
      }
    }
  }

  /** 先頭の人を退場させる（ラウンド終了時） */
  releaseCurrent(): void {
    if (this.currentSerial === null) return;
    const t = this.tracked.get(this.currentSerial);
    if (t) {
      t.leaving = true;
      t.target.copy(EXIT);
      t.person.root.visible = true;
    }
    this.currentSerial = null;
  }

  setCurrentVisible(visible: boolean): void {
    if (this.currentSerial === null) return;
    const t = this.tracked.get(this.currentSerial);
    if (t && !t.leaving) t.person.root.visible = visible;
  }

  clear(): void {
    for (const t of this.tracked.values()) this.group.remove(t.person.root);
    this.tracked.clear();
    this.currentSerial = null;
  }

  update(dt: number): void {
    for (const [serial, t] of this.tracked) {
      const root = t.person.root;
      const delta = new Vector3().subVectors(t.target, root.position).setY(0);
      const dist = delta.length();
      const moving = dist > 0.01;
      if (moving) {
        const step = Math.min(dist, WALK_SPEED * dt);
        root.position.addScaledVector(delta.normalize(), step);
        root.rotation.y = lerpAngle(root.rotation.y, Math.atan2(delta.x, delta.z), Math.min(1, dt * 12));
      } else {
        root.position.x = t.target.x;
        root.position.z = t.target.z;
        root.rotation.y = lerpAngle(root.rotation.y, t.facing, Math.min(1, dt * 8));
      }
      t.person.update(dt, moving);
      if (t.leaving && !moving) {
        this.group.remove(root);
        this.tracked.delete(serial);
      }
    }
  }

  private ensure(entry: QueueEntry, spawnAt: Vector3): Tracked {
    let t = this.tracked.get(entry.serial);
    if (!t) {
      const person = new PersonView(entry.kind);
      person.root.position.copy(spawnAt);
      person.root.rotation.y = -Math.PI / 2;
      this.group.add(person.root);
      t = { person, target: spawnAt.clone(), facing: -Math.PI / 2, leaving: false };
      this.tracked.set(entry.serial, t);
    }
    return t;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
