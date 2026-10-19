import type { Vec2 } from '../attacks/AttackTypes';

/**
 * ドラッグ量を移動ベクトルに変換する。+x=右, +y=上（画面座標の y は下向きなので反転）。
 * deadzone 未満は 0、radius 以上は長さ1。間は線形（ゆっくり動かすこともできる）。
 */
export function joystickVector(dx: number, dy: number, radius: number, deadzone: number): Vec2 {
  const len = Math.hypot(dx, dy);
  if (len <= deadzone || radius <= deadzone) return { x: 0, y: 0 };
  const mag = Math.min(1, (len - deadzone) / (radius - deadzone));
  return { x: (dx / len) * mag, y: (-dy / len) * mag };
}

/** 基点を指から一定距離以内に追従させる（大きく動かしたあと逆方向へすぐ切り返せる） */
export function followOrigin(origin: Vec2, finger: Vec2, radius: number): Vec2 {
  const dx = finger.x - origin.x;
  const dy = finger.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len <= radius) return origin;
  const k = (len - radius) / len;
  return { x: origin.x + dx * k, y: origin.y + dy * k };
}

export interface TouchJoystickOptions {
  radius: number;
  deadzone: number;
}

/**
 * 画面のどこを触ってもその位置に出るフローティング仮想スティック。
 * Pointer Events を使うのでタッチ・ペン・マウスのドラッグすべてで動く。
 */
export class TouchJoystick {
  readonly layer: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;
  private origin: Vec2 = { x: 0, y: 0 };
  private vector: Vec2 = { x: 0, y: 0 };
  private enabled = false;
  private downAt: Vec2 = { x: 0, y: 0 };
  private moved = false;
  private readonly tapListeners: Array<() => void> = [];

  private readonly onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.downAt = { x: e.clientX, y: e.clientY };
    this.moved = false;
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    try {
      this.layer.setPointerCapture(e.pointerId);
    } catch {
      // 一部ブラウザでキャプチャできなくても続行
    }
    this.origin = { x: e.clientX, y: e.clientY };
    this.vector = { x: 0, y: 0 };
    this.render(this.origin);
    this.base.classList.add('active');
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 10) this.moved = true;
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const finger = { x: e.clientX, y: e.clientY };
    this.origin = followOrigin(this.origin, finger, this.options.radius);
    this.vector = joystickVector(finger.x - this.origin.x, finger.y - this.origin.y, this.options.radius, this.options.deadzone);
    this.render(finger);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.moved && e.type === 'pointerup') for (const l of this.tapListeners) l();
    if (e.pointerId !== this.pointerId) return;
    this.release();
  };

  constructor(parent: HTMLElement, private readonly options: TouchJoystickOptions) {
    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.appendChild(this.knob);
    this.layer.appendChild(this.base);
    parent.appendChild(this.layer);
    this.base.style.width = this.base.style.height = `${options.radius * 2}px`;

    this.layer.addEventListener('pointerdown', this.onDown);
    this.layer.addEventListener('pointermove', this.onMove);
    this.layer.addEventListener('pointerup', this.onUp);
    this.layer.addEventListener('pointercancel', this.onUp);
    this.layer.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 移動を受け付けるかどうか（プレイ中のみ有効） */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.release();
  }

  /** ドラッグせずに離した（タップ）ときに呼ばれる。演出スキップ用 */
  onTap(listener: () => void): void {
    this.tapListeners.push(listener);
  }

  get isActive(): boolean {
    return this.pointerId !== null;
  }

  getVector(): Vec2 {
    return this.vector;
  }

  release(): void {
    if (this.pointerId !== null) {
      try {
        this.layer.releasePointerCapture(this.pointerId);
      } catch {
        // 既に解放済み
      }
    }
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };
    this.base.classList.remove('active');
  }

  private render(finger: Vec2): void {
    const r = this.options.radius;
    this.base.style.transform = `translate(${this.origin.x - r}px, ${this.origin.y - r}px)`;
    const dx = finger.x - this.origin.x;
    const dy = finger.y - this.origin.y;
    const len = Math.hypot(dx, dy);
    const k = len > r ? r / len : 1;
    this.knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
  }

  dispose(): void {
    this.release();
    this.layer.remove();
  }
}
