import type { EnemyProfile } from '../entities/EnemyProfiles';
import { GameConfig } from '../game/GameConfig';
import type { SeededRandom } from '../game/SeededRandom';
import type { ActivePattern, AttackKind, Impact, ImpactKind, Vec2 } from './AttackTypes';

type Tuning = typeof GameConfig.attack;

export interface RoundAttackOptions {
  kind: AttackKind;
  profile: EnemyProfile;
  /** ショットガンの散布・コンボの順番・跳ね返りの揺れに使う（シード付き） */
  rng: SeededRandom;
  fireIntervalMultiplier: number;
  pelletCount: number;
  /** 発射を始めてよいラウンド時刻（予備動作の終わり） */
  startAt: number;
  /** 発射を終えるラウンド時刻 */
  endAt: number;
}

export interface AttackUpdateContext {
  now: number;
  /** 敵コントローラがこのステップで出した尿流の発射回数 */
  shots: number;
  /** 敵が発射中か（おじいちゃんの休止中などは false） */
  streaming: boolean;
  /** 現在の照準（メトリック座標）。発射した瞬間の値で着弾位置が確定する */
  aim: Vec2;
  toUV: (x: number, y: number) => { u: number; v: number };
}

export interface PatternSegment {
  pattern: ActivePattern;
  from: number;
  to: number;
}

const STREAM_PATTERNS: ReadonlySet<ActivePattern> = new Set(['single', 'twoWay', 'threeWay']);

/**
 * 攻撃パターンから Impact（着弾イベント）を生成する。描画はここで作られた配列を可視化するだけ。
 *
 * - single / twoWay / threeWay: 照準（＋固定オフセット）へ尿流を出し続ける
 * - shotgun: 着弾予定地点を予告 → telegraph 秒後に一斉発射。粒の位置は予告の時点で確定し、以後変わらない
 * - combo: 上記を時間で区切って順に使う。区間の間には必ず休止(gap)を挟み、同時に重ねない
 * - 跳ね返り（マッチョ）: 一次着弾の瞬間に予兆マーカーを出し、delay 秒後に二次着弾
 */
export class AttackDirector {
  static readonly supportedKinds: readonly AttackKind[] = ['single', 'twoWay', 'threeWay', 'shotgun', 'combo'];

  private impactId = 0;
  private attackId = 0;
  private streamAttackStartedAt = -Infinity;
  private wasEmitting = false;
  private opts: RoundAttackOptions | null = null;
  private segmentList: PatternSegment[] = [];
  private nextVolleyAt = 0;
  private primaryCount = 0;
  private current: ActivePattern = 'gap';

  constructor(private readonly tuning: Tuning = GameConfig.attack) {}

  reset(): void {
    this.opts = null;
    this.segmentList = [];
    this.streamAttackStartedAt = -Infinity;
    this.wasEmitting = false;
    this.nextVolleyAt = 0;
    this.primaryCount = 0;
    this.current = 'gap';
  }

  beginRound(opts: RoundAttackOptions): void {
    this.reset();
    this.opts = opts;
    this.segmentList = this.buildSegments(opts);
    this.nextVolleyAt = opts.startAt;
  }

  get segments(): readonly PatternSegment[] {
    return this.segmentList;
  }

  /** 直近の update 時点で実行中のパターン */
  get pattern(): ActivePattern {
    return this.current;
  }

  patternAt(t: number): ActivePattern {
    return this.segmentAt(t)?.pattern ?? 'gap';
  }

  /** 照準に対する尿流の着弾オフセット（照準リングの表示にも使う） */
  offsets(pattern: ActivePattern): Vec2[] {
    switch (pattern) {
      case 'twoWay': {
        const r = this.opts?.profile.impactRadius ?? 0;
        const h = r + this.tuning.twoWayClear / 2;
        return [{ x: -h, y: 0 }, { x: h, y: 0 }];
      }
      case 'threeWay': {
        const { side, drop, baseRadius } = this.tuning.threeWay;
        const extra = Math.max(0, (this.opts?.profile.impactRadius ?? baseRadius) - baseRadius) * 1.5;
        return [{ x: 0, y: 0 }, { x: -(side + extra), y: -(drop + extra) }, { x: side + extra, y: -(drop + extra) }];
      }
      default:
        return [{ x: 0, y: 0 }];
    }
  }

  update(ctx: AttackUpdateContext): Impact[] {
    const opts = this.opts;
    const out: Impact[] = [];
    if (!opts) return out;
    const seg = this.segmentAt(ctx.now);
    this.current = seg?.pattern ?? 'gap';

    const emitting = ctx.streaming && STREAM_PATTERNS.has(this.current);
    if (!emitting && this.wasEmitting) this.streamAttackStartedAt = -Infinity; // 途切れたら次は別の攻撃
    this.wasEmitting = emitting;

    if (emitting) {
      const attackId = this.streamAttackId(ctx.now);
      for (let s = 0; s < ctx.shots; s++) {
        this.offsets(this.current).forEach((o, lane) => {
          const at = { x: ctx.aim.x + o.x, y: ctx.aim.y + o.y };
          const impactAt = ctx.now + opts.profile.timeToImpact;
          const imp = this.make(ctx, 'stream', attackId, at, opts.profile.impactRadius, ctx.now, impactAt, impactAt + this.tuning.impactLifetime, undefined, undefined, lane);
          if (imp) {
            out.push(imp);
            this.maybeBounce(ctx, imp, at, out);
          }
        });
      }
    }

    if (this.current === 'shotgun' && seg && ctx.streaming && ctx.now >= this.nextVolleyAt) {
      // 予告から発射までが区間内に収まる場合だけ撃つ（区間の後ろの休止で着弾し終える）
      if (ctx.now + this.tuning.shotgun.telegraph <= seg.to) {
        this.volley(ctx, out);
        this.nextVolleyAt = ctx.now + this.tuning.shotgun.interval * opts.fireIntervalMultiplier;
      }
    }
    return out;
  }

  private segmentAt(t: number): PatternSegment | undefined {
    for (const s of this.segmentList) if (t >= s.from && t < s.to) return s;
    return undefined;
  }

  private buildSegments(o: RoundAttackOptions): PatternSegment[] {
    if (o.kind !== 'combo') return [{ pattern: o.kind, from: o.startAt, to: o.endAt }];
    const { segmentMin, segmentMax, gap } = this.tuning.combo;
    const pool: ActivePattern[] = ['twoWay', 'threeWay', 'shotgun', 'single'];
    const list: PatternSegment[] = [];
    let t = o.startAt;
    let prev: ActivePattern | null = null;
    while (t < o.endAt - 0.2) {
      const choices = pool.filter((p) => p !== prev);
      const pattern = o.rng.pick(choices);
      const to = Math.min(o.endAt, t + o.rng.range(segmentMin, segmentMax));
      list.push({ pattern, from: t, to });
      prev = pattern;
      t = to;
      if (t < o.endAt) {
        const gapTo = Math.min(o.endAt, t + gap);
        list.push({ pattern: 'gap', from: t, to: gapTo });
        t = gapTo;
      }
    }
    return list;
  }

  private streamAttackId(now: number): number {
    if (now - this.streamAttackStartedAt >= this.tuning.streamSegmentSeconds) {
      this.attackId += 1;
      this.streamAttackStartedAt = now;
    }
    return this.attackId;
  }

  private volley(ctx: AttackUpdateContext, out: Impact[]): void {
    const opts = this.opts!;
    const cfg = this.tuning.shotgun;
    const rng = opts.rng;
    this.attackId += 1;
    const attackId = this.attackId;
    const n = Math.max(2, opts.pelletCount);
    const spread = (cfg.spreadDeg * Math.PI) / 180;
    const step = spread / (n - 1);
    const facing = rng.range(0, Math.PI * 2);
    const center = { ...ctx.aim };
    const spawnAt = ctx.now + cfg.telegraph;
    const impactAt = spawnAt + opts.profile.timeToImpact;
    const radius = opts.profile.impactRadius * cfg.radiusScale;
    for (let i = 0; i < n; i++) {
      const a = facing - spread / 2 + i * step + rng.range(-0.15, 0.15) * step;
      const d = rng.range(cfg.minDist, cfg.maxDist);
      const at = { x: center.x + Math.sin(a) * d, y: center.y + Math.cos(a) * d };
      const imp = this.make(ctx, 'pellet', attackId, at, radius, spawnAt, impactAt, impactAt + cfg.lifetime, ctx.now);
      if (imp) {
        out.push(imp);
        this.maybeBounce(ctx, imp, at, out);
      }
    }
  }

  private maybeBounce(ctx: AttackUpdateContext, primary: Impact, primaryAt: Vec2, out: Impact[]): void {
    const opts = this.opts!;
    const b = opts.profile.bounce;
    if (b.every <= 0) return;
    this.primaryCount += 1;
    if (this.primaryCount % b.every !== 0) return;
    const at = { x: primaryAt.x + opts.rng.range(-b.jitter, b.jitter), y: primaryAt.y - b.drop };
    const impactAt = primary.impactAt + b.delay;
    const imp = this.make(
      ctx,
      'bounce',
      primary.attackId,
      at,
      opts.profile.impactRadius * b.radiusScale,
      primary.impactAt,
      impactAt,
      impactAt + this.tuning.impactLifetime,
      primary.impactAt,
      primary,
    );
    if (imp) out.push(imp);
  }

  private make(
    ctx: AttackUpdateContext,
    kind: ImpactKind,
    attackId: number,
    at: Vec2,
    radius: number,
    spawnAt: number,
    impactAt: number,
    endAt: number,
    warnAt?: number,
    from?: Impact,
    lane?: number,
  ): Impact | null {
    const { u, v } = ctx.toUV(at.x, at.y);
    // 便器の外に大きく外れた着弾は作らない（判定上も当たり得ない）
    if (u < -0.15 || u > 1.15 || v < -0.1 || v > 1.05) return null;
    this.impactId += 1;
    return {
      id: this.impactId,
      attackId,
      u,
      v,
      radius,
      spawnAt,
      impactAt,
      endAt,
      kind,
      ...(warnAt !== undefined ? { warnAt } : {}),
      ...(from ? { fromU: from.u, fromV: from.v } : {}),
      ...(lane !== undefined ? { lane } : {}),
    };
  }
}
