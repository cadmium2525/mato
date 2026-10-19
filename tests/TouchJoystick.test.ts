import { describe, expect, it } from 'vitest';
import { followOrigin, joystickVector } from '../src/input/TouchJoystick';

describe('joystickVector', () => {
  it('デッドゾーン内は0（指を置いただけでは動かない）', () => {
    expect(joystickVector(0, 0, 56, 6)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(3, -4, 56, 6)).toEqual({ x: 0, y: 0 });
  });

  it('画面の下方向ドラッグは下（-y）、右は右（+x）', () => {
    const down = joystickVector(0, 100, 56, 6);
    expect(down.x).toBeCloseTo(0);
    expect(down.y).toBeCloseTo(-1);
    const right = joystickVector(100, 0, 56, 6);
    expect(right.x).toBeCloseTo(1);
  });

  it('長さは1を超えない（キーボードより速くならない）', () => {
    for (const [dx, dy] of [[500, 500], [-80, 30], [40, 40], [0, -1000]]) {
      const v = joystickVector(dx, dy, 56, 6);
      expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('半径の途中ではアナログに速度が変わる', () => {
    const half = joystickVector(31, 0, 56, 6);
    expect(half.x).toBeCloseTo(0.5);
  });
});

describe('followOrigin', () => {
  it('半径内なら基点は動かない', () => {
    expect(followOrigin({ x: 0, y: 0 }, { x: 30, y: 0 }, 56)).toEqual({ x: 0, y: 0 });
  });
  it('半径を超えたら指から半径の距離まで引き寄せる', () => {
    const o = followOrigin({ x: 0, y: 0 }, { x: 156, y: 0 }, 56);
    expect(o.x).toBeCloseTo(100);
    expect(o.y).toBeCloseTo(0);
    // 逆方向に少し戻すだけで逆向きに入力できる
    expect(joystickVector(90 - o.x, 0, 56, 6).x).toBeLessThan(0);
  });
});
