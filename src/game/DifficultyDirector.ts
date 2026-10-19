import type { AttackKind } from '../attacks/AttackTypes';

export interface DifficultyTier {
  /** この番号の相手から適用 */
  fromEnemy: number;
  attacks: readonly AttackKind[];
}

/** 解禁テーブル（仮値）。「これから対峙する相手の通し番号」で引く */
export const DIFFICULTY_TABLE: readonly DifficultyTier[] = [
  { fromEnemy: 1, attacks: ['single'] },
  { fromEnemy: 4, attacks: ['single', 'twoWay'] },
  { fromEnemy: 8, attacks: ['single', 'twoWay', 'threeWay'] },
  { fromEnemy: 13, attacks: ['single', 'twoWay', 'threeWay', 'shotgun'] },
  { fromEnemy: 18, attacks: ['single', 'twoWay', 'threeWay', 'shotgun', 'combo'] },
];

export interface DifficultySettings {
  enemyNumber: number;
  attacks: readonly AttackKind[];
  /** キャラ固有の trackingSpeed に掛ける倍率 */
  trackingMultiplier: number;
  /** 発射間隔に掛ける倍率（Phase 2 の弾種で使用） */
  fireIntervalMultiplier: number;
}

export class DifficultyDirector {
  constructor(private readonly table: readonly DifficultyTier[] = DIFFICULTY_TABLE) {}

  forEnemy(enemyNumber: number): DifficultySettings {
    const n = Math.max(1, Math.floor(enemyNumber));
    let tier = this.table[0];
    for (const t of this.table) {
      if (n >= t.fromEnemy) tier = t;
    }
    return {
      enemyNumber: n,
      attacks: tier.attacks,
      // 追尾は少しずつ鋭くなるが、的の速度を超えないよう上限を設ける
      trackingMultiplier: Math.min(1.35, 1 + (n - 1) * 0.025),
      fireIntervalMultiplier: Math.max(0.6, 1 - (n - 1) * 0.02),
    };
  }
}
