import type { Vec2 } from '../attacks/AttackTypes';
import type { RoundSimulation } from '../game/RoundSimulation';
import { normalizeMove } from '../input/InputManager';
import type { UrinalSurface } from '../scene/UrinalSurface';

export type Autopilot = (sim: RoundSimulation) => Vec2;

/**
 * 自動操縦（計画型ボット。上手い人間の代用）。公平性テストと、PV 撮影用の ?autopilot で使う。見えている情報だけを使う:
 * 飛行中の尿粒・予告マーカーの着弾、照準リング（＝ timeToImpact 後にそこへ着弾し続ける）。
 * 9方向それぞれについて、その方向へ動き続けた場合の進路を 0.6 秒先まで試算し、
 * 最初にぶつかる時刻が最も遅く、余裕の大きい方向を選ぶ。反応は 1/30 秒ごと。
 */
export function createAutopilot(surface: UrinalSurface): Autopilot {
  const dirs: Vec2[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < 8; i++) dirs.push(normalizeMove(Math.round(Math.cos((i * Math.PI) / 4)), Math.round(Math.sin((i * Math.PI) / 4))));
  let current: Vec2 = { x: 0, y: 0 };
  let counter = 0;
  const HORIZON = 0.6;
  const DT = 0.04;
  return (sim: RoundSimulation) => {
    if (counter++ % 4 !== 0) return current;
    const now = sim.time;
    const p = sim.player.position;
    const enemy = sim.enemy!;
    const speed = sim.player.speed;
    const hr = sim.player.hitRadius;
    const margin = 0.008;
    const visible = sim.impacts.filter(
      (i) => i.endAt >= now && (i.spawnAt <= now || (i.warnAt !== undefined && i.warnAt <= now)),
    ).map((i) => ({ c: surface.toMetricUV(i.u, i.v), from: i.impactAt - now, to: i.endAt - now, r: i.radius }));
    const tti = enemy.profile.timeToImpact;
    const pattern = enemy.state === 'windup' ? sim.attacks.patternAt(enemy.profile.windupSeconds) : sim.attacks.pattern;
    const firing = enemy.state === 'streaming' || enemy.state === 'windup' || enemy.state === 'warning';
    const streamTargets = firing && pattern !== 'shotgun' && pattern !== 'gap'
      ? sim.attacks.offsets(pattern).map((o) => ({ x: enemy.aim.x + o.x, y: enemy.aim.y + o.y }))
      : [];
    const startIn = enemy.state === 'windup' ? enemy.profile.windupSeconds - enemy.elapsed + tti : tti;
    const r0 = enemy.profile.impactRadius;
    let best = current;
    let bestScore = -Infinity;
    for (const d of dirs) {
      let q = { ...p };
      let hitAt = HORIZON + DT;
      let clearance = 1;
      for (let t = DT; t <= HORIZON + 1e-9; t += DT) {
        q = surface.clampMetric({ x: q.x + d.x * speed * DT, y: q.y + d.y * speed * DT }, sim.player.visualRadius);
        let worst = 1;
        for (const v of visible) {
          if (t < v.from - 0.02 || t > v.to + 0.02) continue;
          worst = Math.min(worst, Math.hypot(q.x - v.c.x, q.y - v.c.y) - v.r - hr);
        }
        if (t >= startIn) {
          // 照準は的を追ってくるので、時間とともに危険範囲が広がるとみなす
          const swaySpeed = enemy.profile.sway.amplitude * Math.PI * 2 * enemy.profile.sway.frequency;
          const grow = (t - startIn) * (enemy.profile.trackingSpeed + swaySpeed) * 0.8;
          for (const c of streamTargets) worst = Math.min(worst, Math.hypot(q.x - c.x, q.y - c.y) - r0 - hr - grow);
        }
        clearance = Math.min(clearance, worst);
        if (worst < margin) {
          hitAt = t;
          break;
        }
      }
      const center = Math.hypot(q.x - surface.widthM / 2, q.y - surface.heightM / 2);
      const score = hitAt * 10 + Math.min(clearance, 0.1) - center * 0.3 + (d.x === current.x && d.y === current.y ? 0.02 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    current = best;
    return best;
  };
}
