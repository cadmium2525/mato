import { GameConfig } from './GameConfig';

type ScoreParams = typeof GameConfig.score;

export interface BestRecord {
  cleared: number;
  score: number;
  survivalTime: number;
  seed: number;
}

/** 人数 → 回避スコア → 生存時間 の順で比較。a が b より良ければ true */
export function isBetterRecord(a: BestRecord, b: BestRecord | null): boolean {
  if (!b) return true;
  if (a.cleared !== b.cleared) return a.cleared > b.cleared;
  if (a.score !== b.score) return a.score > b.score;
  return a.survivalTime > b.survivalTime;
}

export class ScoreManager {
  survivalTime = 0;
  nearMisses = 0;
  private bonus = 0;
  private streak = 0;
  private lastNearMissAt = -Infinity;

  constructor(
    private readonly params: ScoreParams = GameConfig.score,
    private readonly streakWindow: number = GameConfig.nearMiss.streakWindow,
  ) {}

  reset(): void {
    this.survivalTime = 0;
    this.nearMisses = 0;
    this.bonus = 0;
    this.streak = 0;
    this.lastNearMissAt = -Infinity;
  }

  addSurvival(dt: number): void {
    this.survivalTime += dt;
  }

  addNearMiss(now: number): void {
    this.nearMisses += 1;
    this.bonus += this.params.nearMiss;
    this.streak = now - this.lastNearMissAt <= this.streakWindow ? this.streak + 1 : 1;
    this.lastNearMissAt = now;
    if (this.streak % 3 === 0) this.bonus += this.params.nearMissStreak3;
  }

  roundCleared(): void {
    this.bonus += this.params.roundClear;
  }

  get score(): number {
    return Math.floor(this.survivalTime * this.params.perSecond) + this.bonus;
  }
}

const STORAGE_KEY = 'mato.best.v1';

/** localStorage を使えない環境（プライベートモード等）でも落ちない記録保存 */
export class BestStore {
  constructor(private readonly getStorage: () => Storage | null = defaultStorage) {}

  load(): BestRecord | null {
    try {
      const raw = this.getStorage()?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<BestRecord>;
      if (typeof data.cleared !== 'number' || typeof data.score !== 'number') return null;
      return {
        cleared: data.cleared,
        score: data.score,
        survivalTime: typeof data.survivalTime === 'number' ? data.survivalTime : 0,
        seed: typeof data.seed === 'number' ? data.seed : 0,
      };
    } catch {
      return null;
    }
  }

  save(record: BestRecord): boolean {
    try {
      const storage = this.getStorage();
      if (!storage) return false;
      storage.setItem(STORAGE_KEY, JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  }

  /** 記録を比較し、更新なら保存して true を返す */
  submit(record: BestRecord): { isNewBest: boolean; best: BestRecord } {
    const prev = this.load();
    if (isBetterRecord(record, prev)) {
      this.save(record);
      return { isNewBest: true, best: record };
    }
    return { isNewBest: false, best: prev ?? record };
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
