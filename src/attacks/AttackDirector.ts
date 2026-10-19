import type { EnemyProfile } from '../entities/EnemyProfiles';
import type { AttackKind, Impact, Vec2 } from './AttackTypes';

export interface FireContext {
  kind: AttackKind;
  /** 発射時点の照準（メトリック座標）。ここで確定し、以後的を追わない */
  aim: Vec2;
  now: number;
  profile: EnemyProfile;
  toUV: (x: number, y: number) => { u: number; v: number };
}

/**
 * 攻撃パターンから Impact を生成する。Renderer はここで作られた配列を可視化するだけ。
 * Phase 1 は single（尿流1本）。
 * TODO(phase2): twoWay / threeWay / shotgun / combo の生成と、安全な回避経路の保証
 */
export class AttackDirector {
  static readonly supportedKinds: readonly AttackKind[] = ['single'];

  private impactId = 0;
  private attackId = 0;
  private segmentStartedAt = -Infinity;

  constructor(
    private readonly impactLifetime: number,
    private readonly segmentSeconds: number,
  ) {}

  reset(): void {
    this.segmentStartedAt = -Infinity;
  }

  /** 尿流を一定時間ごとに別の攻撃として区切る（ニアミスを1攻撃1回にするため） */
  private currentAttackId(now: number): number {
    if (now - this.segmentStartedAt >= this.segmentSeconds) {
      this.attackId += 1;
      this.segmentStartedAt = now;
    }
    return this.attackId;
  }

  /** 尿流が途切れたら次は新しい攻撃として扱う */
  breakStream(): void {
    this.segmentStartedAt = -Infinity;
  }

  fire(ctx: FireContext): Impact[] {
    const kind = AttackDirector.supportedKinds.includes(ctx.kind) ? ctx.kind : 'single';
    switch (kind) {
      case 'single':
      default:
        return [this.makeImpact(ctx, ctx.aim, ctx.profile.impactRadius)];
    }
  }

  private makeImpact(ctx: FireContext, at: Vec2, radius: number): Impact {
    const { u, v } = ctx.toUV(at.x, at.y);
    this.impactId += 1;
    const impactAt = ctx.now + ctx.profile.timeToImpact;
    return {
      id: this.impactId,
      attackId: this.currentAttackId(ctx.now),
      u,
      v,
      radius,
      spawnAt: ctx.now,
      impactAt,
      endAt: impactAt + this.impactLifetime,
    };
  }
}
