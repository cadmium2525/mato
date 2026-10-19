import { describe, expect, it } from 'vitest';
import { AttackDirector } from '../src/attacks/AttackDirector';
import { TrackingEnemyController } from '../src/entities/EnemyController';
import { ENEMY_KINDS, ENEMY_PROFILES, getProfile, validateProfile, type EnemyKind } from '../src/entities/EnemyProfiles';
import { TargetPlayer } from '../src/entities/TargetPlayer';
import { GameConfig } from '../src/game/GameConfig';
import { SeededRandom } from '../src/game/SeededRandom';
import { UrinalSurface } from '../src/scene/UrinalSurface';

const surface = new UrinalSurface();
const playerSpeed = new TargetPlayer(surface).speed;

function controller(kind: EnemyKind = 'salaryman', seed = 1) {
  return new TrackingEnemyController(getProfile(kind), {
    bounds: { width: surface.widthM, height: surface.heightM },
    initialAim: { x: 0.05, y: 0.3 },
    emitInterval: GameConfig.attack.emitInterval,
    trackingMultiplier: 1,
    rng: new SeededRandom(seed),
  });
}

describe('EnemyProfiles', () => {
  it('全4キャラの設定値が有効', () => {
    expect(ENEMY_KINDS).toHaveLength(4);
    for (const kind of ENEMY_KINDS) {
      expect(ENEMY_PROFILES[kind].kind).toBe(kind);
      expect(validateProfile(ENEMY_PROFILES[kind], playerSpeed)).toEqual([]);
    }
  });
  it('難易度最大倍率でも照準は的より遅い', () => {
    for (const kind of ENEMY_KINDS) expect(ENEMY_PROFILES[kind].trackingSpeed * 1.35).toBeLessThan(playerSpeed);
  });
});

describe('TrackingEnemyController', () => {
  it('予備動作中は発射せず、その後発射し、終わると done', () => {
    const c = controller();
    const player = { x: 0.2, y: 0.2 };
    let shotsDuringWindup = 0;
    while (c.elapsed < c.profile.windupSeconds - 0.02) shotsDuringWindup += c.update(1 / 120, player);
    expect(shotsDuringWindup).toBe(0);
    let shots = 0;
    while (c.state !== 'done') shots += c.update(1 / 120, player);
    expect(shots).toBeGreaterThan(c.profile.durationSeconds * 50);
  });

  it('照準は瞬間移動しない（1ステップの移動量が上限以下）', () => {
    const c = controller('drunk');
    let prev = { ...c.aim };
    const limit = c.profile.trackingSpeed / 120 + 0.02; // 揺れ分の余裕
    for (let i = 0; i < 1200; i++) {
      const player = { x: i % 240 < 120 ? 0.02 : surface.widthM - 0.02, y: 0.1 };
      c.update(1 / 120, player);
      expect(Math.hypot(c.aim.x - prev.x, c.aim.y - prev.y)).toBeLessThan(limit);
      prev = { ...c.aim };
    }
  });

  it('同じ乱数シードなら照準の軌跡が同じ', () => {
    const a = controller('drunk', 5);
    const b = controller('drunk', 5);
    for (let i = 0; i < 300; i++) {
      a.update(1 / 120, { x: 0.3, y: 0.3 });
      b.update(1 / 120, { x: 0.3, y: 0.3 });
    }
    expect(a.aim).toEqual(b.aim);
  });

  it('おじいちゃんは断続発射し、再開前に warning を出す', () => {
    const c = controller('elderly');
    const states = new Set<string>();
    while (c.state !== 'done') {
      c.update(1 / 120, { x: 0.2, y: 0.2 });
      states.add(c.state);
    }
    expect(states).toContain('paused');
    expect(states).toContain('warning');
    expect(states).toContain('streaming');
  });
});

describe('AttackDirector (single)', () => {
  it('発射済みの着弾予定位置は、その後的が動いても変わらない', () => {
    const c = controller();
    const director = new AttackDirector(GameConfig.attack);
    const p = c.profile;
    director.beginRound({ kind: 'single', profile: p, rng: new SeededRandom(1), fireIntervalMultiplier: 1, pelletCount: 5, startAt: p.windupSeconds, endAt: p.windupSeconds + p.durationSeconds });
    let now = 0;
    let player = { x: 0.1, y: 0.2 };
    const toUV = (x: number, y: number) => surface.fromMetric(x, y);
    let impacts: ReturnType<AttackDirector['update']> = [];
    while (impacts.length === 0) {
      now += 1 / 120;
      const shots = c.update(1 / 120, player);
      impacts = director.update({ now, shots, streaming: c.state === 'streaming', aim: c.aim, toUV });
    }
    const snapshot = impacts.map((i) => ({ ...i }));
    for (let i = 0; i < 60; i++) {
      player = { x: surface.widthM - 0.05, y: surface.heightM - 0.05 };
      now += 1 / 120;
      const shots = c.update(1 / 120, player);
      director.update({ now, shots, streaming: c.state === 'streaming', aim: c.aim, toUV });
    }
    expect(impacts).toEqual(snapshot);
    expect(impacts[0].impactAt).toBeCloseTo(snapshot[0].spawnAt + p.timeToImpact);
  });
});
