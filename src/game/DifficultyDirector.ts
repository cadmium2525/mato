import type { AttackKind } from '../attacks/AttackTypes';
import type { SeededRandom } from './SeededRandom';

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
  /** ショットガンの一斉射撃間隔に掛ける倍率 */
  fireIntervalMultiplier: number;
  /** ショットガン1回の粒数（5〜7） */
  pelletCount: number;
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
      fireIntervalMultiplier: Math.max(0.75, 1 - (n - 1) * 0.01),
      pelletCount: Math.min(7, Math.max(5, 5 + Math.floor((n - 13) / 3))),
    };
  }

  /**
   * この相手に使わせる攻撃を選ぶ。
   * - 解禁されたばかりの攻撃は、まだ出ていなければ必ず出す（4人目で2WAYを体験させる）
   * - それ以外は最新の攻撃を 40%、残りを均等に（キャラの癖との組み合わせでリプレイ性を出す）
   * used は今回のゲームで既に出た攻撃（呼び出し側が更新する）
   */
  chooseAttack(enemyNumber: number, rng: SeededRandom, used: ReadonlySet<AttackKind>): AttackKind {
    const attacks = this.forEnemy(enemyNumber).attacks;
    const newest = attacks[attacks.length - 1];
    if (!used.has(newest)) return newest;
    if (attacks.length === 1 || rng.next() < 0.4) return newest;
    return rng.pick(attacks.slice(0, -1));
  }
}
