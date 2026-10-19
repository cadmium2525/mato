import { describe, expect, it } from 'vitest';
import { TargetPlayer } from '../src/entities/TargetPlayer';
import { GameConfig } from '../src/game/GameConfig';
import { normalizeMove } from '../src/input/InputManager';
import { UrinalSurface } from '../src/scene/UrinalSurface';

const surface = new UrinalSurface();

describe('normalizeMove', () => {
  it('斜め入力は長さ1に正規化される', () => {
    const m = normalizeMove(1, 1);
    expect(Math.hypot(m.x, m.y)).toBeCloseTo(1);
    expect(m.x).toBeCloseTo(Math.SQRT1_2);
  });
  it('入力なしは0、単軸はそのまま', () => {
    expect(normalizeMove(0, 0)).toEqual({ x: 0, y: 0 });
    expect(normalizeMove(-1, 0)).toEqual({ x: -1, y: 0 });
  });
});

describe('TargetPlayer', () => {
  it('入力なしでは動かない', () => {
    const p = new TargetPlayer(surface);
    const before = { ...p.position };
    for (let i = 0; i < 120; i++) p.update(1 / 120, { x: 0, y: 0 });
    expect(p.position).toEqual(before);
  });

  it('移動境界を越えない', () => {
    const p = new TargetPlayer(surface);
    for (const dir of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, normalizeMove(1, 1)]) {
      for (let i = 0; i < 600; i++) p.update(1 / 120, dir);
      const { u, v } = p.uv;
      expect(surface.isInsidePlayableArea(u, v)).toBe(true);
      expect(p.position.x).toBeGreaterThanOrEqual(p.visualRadius - 1e-9);
      expect(p.position.x).toBeLessThanOrEqual(surface.widthM - p.visualRadius + 1e-9);
      expect(p.position.y).toBeGreaterThanOrEqual(p.visualRadius - 1e-9);
      expect(p.position.y).toBeLessThanOrEqual(surface.heightM - p.visualRadius + 1e-9);
    }
  });

  it('斜め移動は軸移動より速くならない', () => {
    const a = new TargetPlayer(surface);
    const b = new TargetPlayer(surface);
    a.update(0.05, { x: 1, y: 0 });
    b.update(0.05, normalizeMove(1, 1));
    const da = Math.hypot(a.position.x - a.previous.x, a.position.y - a.previous.y);
    const db = Math.hypot(b.position.x - b.previous.x, b.position.y - b.previous.y);
    expect(db).toBeLessThanOrEqual(da + 1e-12);
  });

  it('便器の横幅を約0.7秒で横断する速度', () => {
    const p = new TargetPlayer(surface);
    expect(p.speed * GameConfig.player.crossSeconds).toBeCloseTo(surface.widthM);
  });

  it('判定半径は見た目より10〜20%小さい', () => {
    const p = new TargetPlayer(surface);
    const ratio = p.hitRadius / p.visualRadius;
    expect(ratio).toBeGreaterThanOrEqual(0.8);
    expect(ratio).toBeLessThanOrEqual(0.9);
  });
});

describe('UrinalSurface', () => {
  it('u は弧長に比例する（toMetricUV が等方）', () => {
    const p0 = surface.surfacePoint(0.5, 0.5);
    let length = 0;
    let prev = p0.clone();
    for (let i = 1; i <= 100; i++) {
      const p = surface.surfacePoint(0.5 + (0.2 * i) / 100, 0.5);
      length += p.distanceTo(prev);
      prev = p;
    }
    expect(length).toBeCloseTo(0.2 * surface.widthM, 3);
  });

  it('法線は手前（便器の内側）を向く単位ベクトル', () => {
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const n = surface.surfaceNormal(u, 0.5);
      expect(n.length()).toBeCloseTo(1);
      expect(n.z).toBeGreaterThan(0);
    }
  });

  it('u が増えると右（+x）、v が増えると上（+y）', () => {
    expect(surface.surfacePoint(0.8, 0.5).x).toBeGreaterThan(surface.surfacePoint(0.2, 0.5).x);
    expect(surface.surfacePoint(0.5, 0.8).y).toBeGreaterThan(surface.surfacePoint(0.5, 0.2).y);
  });

  it('clampToPlayableArea は範囲内に収める', () => {
    const c = surface.clampToPlayableArea(1.5, -0.3);
    expect(surface.isInsidePlayableArea(c.u, c.v)).toBe(true);
  });
});
