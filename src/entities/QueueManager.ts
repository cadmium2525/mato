import { SeededRandom } from '../game/SeededRandom';
import { ENEMY_KINDS, type EnemyKind } from './EnemyProfiles';

export interface QueueEntry {
  /** 通し番号（1始まり）。登場順そのもの */
  serial: number;
  kind: EnemyKind;
}

/**
 * 待機列。表示（peek）と消費（next）が同じ配列を使うので、
 * 画面に並んでいる順番と実際の登場順は必ず一致する。
 */
export class QueueManager {
  private readonly rng: SeededRandom;
  private readonly entries: QueueEntry[] = [];
  private serialCounter = 0;

  constructor(
    seed: number,
    private readonly minUpcoming: number,
    private readonly kinds: readonly EnemyKind[] = ENEMY_KINDS,
  ) {
    this.rng = new SeededRandom(seed ^ 0x51ed270b);
    this.refill();
  }

  /** 先頭から n 人（消費しない） */
  peek(n: number): readonly QueueEntry[] {
    while (this.entries.length < n) this.push();
    return this.entries.slice(0, n);
  }

  /** 先頭の人を取り出す */
  next(): QueueEntry {
    const entry = this.entries.shift() ?? this.makeEntry();
    this.refill();
    return entry;
  }

  get length(): number {
    return this.entries.length;
  }

  private refill(): void {
    while (this.entries.length < this.minUpcoming) this.push();
  }

  private push(): void {
    this.entries.push(this.makeEntry());
  }

  private makeEntry(): QueueEntry {
    // 同じキャラが3人連続しないようにする（ランダム性は維持）
    let kind = this.rng.pick(this.kinds);
    const n = this.entries.length;
    if (this.kinds.length > 1 && n >= 2 && this.entries[n - 1].kind === kind && this.entries[n - 2].kind === kind) {
      const others = this.kinds.filter((k) => k !== kind);
      kind = this.rng.pick(others);
    }
    this.serialCounter += 1;
    return { serial: this.serialCounter, kind };
  }
}
