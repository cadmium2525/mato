export type AttackKind = 'single' | 'twoWay' | 'threeWay' | 'shotgun' | 'combo';

export const ATTACK_NAMES: Record<AttackKind, string> = {
  single: 'シングル',
  twoWay: '2WAY',
  threeWay: '3WAY',
  shotgun: 'ショットガン',
  combo: 'コンボ',
};

/** その瞬間に実行中の攻撃パターン（combo は区間ごとにこれらへ分解される） */
export type ActivePattern = 'single' | 'twoWay' | 'threeWay' | 'shotgun' | 'gap';

export type ImpactKind = 'stream' | 'pellet' | 'bounce';

/** 便器表面上の着弾イベント。発射時に位置が確定し、以後変更されない */
export interface Impact {
  readonly id: number;
  readonly attackId: number;
  readonly u: number;
  readonly v: number;
  readonly radius: number;
  /** 発射時刻（見た目の尿粒の出発時刻） */
  readonly spawnAt: number;
  /** 着弾時刻。ここから判定が有効 */
  readonly impactAt: number;
  /** 判定終了時刻 */
  readonly endAt: number;
  readonly kind: ImpactKind;
  /** この時刻から着弾予定地点に予告マーカーを出す（ショットガン・跳ね返り） */
  readonly warnAt?: number;
  /** 尿粒の出発点が便器表面上にある場合（跳ね返り）の座標 */
  readonly fromU?: number;
  readonly fromV?: number;
}

export interface Vec2 {
  x: number;
  y: number;
}
