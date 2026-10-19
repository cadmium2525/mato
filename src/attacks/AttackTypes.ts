export type AttackKind = 'single' | 'twoWay' | 'threeWay' | 'shotgun' | 'combo';

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
}

export interface Vec2 {
  x: number;
  y: number;
}
