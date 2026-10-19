import type { Vec2 } from '../attacks/AttackTypes';

/** 入力ベクトルを長さ1以下に正規化する（斜め移動が速くならない） */
export function normalizeMove(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  if (len <= 1) return { x, y };
  return { x: x / len, y: y / len };
}

export type ActionName = 'confirm' | 'pause' | 'retry' | 'title';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const ACTION_KEYS: Record<string, ActionName> = {
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'confirm',
  Escape: 'pause',
  KeyP: 'pause',
  KeyR: 'retry',
  KeyT: 'title',
};

/** ゲーム中にページをスクロールさせないキー */
const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class InputManager {
  private readonly pressed = new Set<string>();
  private readonly actionListeners: Array<(action: ActionName) => void> = [];
  private readonly blurListeners: Array<() => void> = [];

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (MOVE_KEYS[e.code]) this.pressed.add(e.code);
    const action = ACTION_KEYS[e.code];
    // ボタンにフォーカスがあるときの Enter/Space はボタン自身の click に任せる（二重発火防止）
    const onButton = e.target instanceof HTMLButtonElement;
    if (action && !e.repeat && !(action === 'confirm' && onButton)) {
      for (const l of this.actionListeners) l(action);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    for (const l of this.blurListeners) l();
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) this.onBlur();
  };

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  onAction(listener: (action: ActionName) => void): void {
    this.actionListeners.push(listener);
  }

  onFocusLost(listener: () => void): void {
    this.blurListeners.push(listener);
  }

  getMoveVector(): Vec2 {
    let x = 0;
    let y = 0;
    for (const code of this.pressed) {
      const m = MOVE_KEYS[code];
      if (m) {
        x += m[0];
        y += m[1];
      }
    }
    // 同方向の重複（W と ↑ など）を -1..1 に収める
    return normalizeMove(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.actionListeners.length = 0;
    this.blurListeners.length = 0;
  }
}
