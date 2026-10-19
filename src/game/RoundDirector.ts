import { QueueManager, type QueueEntry } from '../entities/QueueManager';
import { GameConfig } from './GameConfig';
import type { Phase } from './GameState';

type Timing = typeof GameConfig.timing;

export interface RoundDirectorEvents {
  onPhaseChange?: (phase: Phase, previous: Phase) => void;
}

/**
 * ゲームの状態遷移と人数カウントを担当する（描画に依存しない）。
 * TITLE → INTRO → QUEUE_PAN → ROUND_READY → PLAYING → ROUND_CLEAR → ROUND_READY → … → HIT → GAME_OVER
 */
export class RoundDirector {
  phase: Phase = 'TITLE';
  phaseTime = 0;
  /** 生存して見送った人数（＝◯人抜き） */
  cleared = 0;
  /** 現在対峙している相手の通し番号（1始まり、未開始は0） */
  enemyNumber = 0;
  current: QueueEntry | null = null;
  seed = 0;
  queue: QueueManager;
  private pausedFrom: Phase | null = null;
  private hasPlayedIntro = false;
  private isRetry = false;

  constructor(
    private readonly timing: Timing = GameConfig.timing,
    private readonly minUpcoming: number = GameConfig.queue.minUpcoming,
    private readonly events: RoundDirectorEvents = {},
  ) {
    this.queue = new QueueManager(0, minUpcoming);
  }

  startGame(seed: number): void {
    this.seed = seed;
    this.queue = new QueueManager(seed, this.minUpcoming);
    this.cleared = 0;
    this.enemyNumber = 0;
    this.current = null;
    this.pausedFrom = null;
    this.isRetry = this.hasPlayedIntro;
    if (!this.hasPlayedIntro) {
      this.hasPlayedIntro = true;
      this.setPhase('INTRO');
    } else {
      this.setPhase('QUEUE_PAN');
    }
  }

  get queuePanSeconds(): number {
    return this.isRetry ? this.timing.queuePanRetry : this.timing.queuePanFirst;
  }

  update(dt: number): void {
    if (this.phase === 'PAUSED') return;
    this.phaseTime += dt;
    switch (this.phase) {
      case 'INTRO':
        if (this.phaseTime >= this.timing.intro) this.setPhase('QUEUE_PAN');
        break;
      case 'QUEUE_PAN':
        if (this.phaseTime >= this.queuePanSeconds) this.beginRound();
        break;
      case 'ROUND_READY':
        if (this.phaseTime >= this.timing.roundReady) this.setPhase('PLAYING');
        break;
      case 'ROUND_CLEAR':
        if (this.phaseTime >= this.timing.roundClear) this.beginRound();
        break;
      case 'HIT':
        if (this.phaseTime >= this.timing.hitSlowmo) this.setPhase('GAME_OVER');
        break;
      default:
        break;
    }
  }

  /** 演出のスキップ（Enter/Space） */
  skip(): void {
    if (this.phase === 'INTRO') this.setPhase('QUEUE_PAN');
    else if (this.phase === 'QUEUE_PAN') this.beginRound();
  }

  /** 相手の排尿が終わり、すべての着弾が消えた。生存していれば人数+1 */
  completeRound(): void {
    if (this.phase !== 'PLAYING') return;
    this.cleared += 1;
    this.setPhase('ROUND_CLEAR');
  }

  /** 被弾。そのラウンドは人数に数えない */
  registerHit(): void {
    if (this.phase !== 'PLAYING') return;
    this.setPhase('HIT');
  }

  pause(): boolean {
    if (this.phase !== 'PLAYING' && this.phase !== 'ROUND_READY') return false;
    this.pausedFrom = this.phase;
    const prev = this.phase;
    this.phase = 'PAUSED';
    this.events.onPhaseChange?.('PAUSED', prev);
    return true;
  }

  resume(): void {
    if (this.phase !== 'PAUSED' || !this.pausedFrom) return;
    const back = this.pausedFrom;
    this.pausedFrom = null;
    // phaseTime は保持したまま戻す
    this.phase = back;
    this.events.onPhaseChange?.(back, 'PAUSED');
  }

  toTitle(): void {
    this.pausedFrom = null;
    this.setPhase('TITLE');
  }

  /** 次に来る人たち（表示用）。消費キューと同じデータ */
  upcoming(n: number): readonly QueueEntry[] {
    return this.queue.peek(n);
  }

  private beginRound(): void {
    this.current = this.queue.next();
    this.enemyNumber += 1;
    this.setPhase('ROUND_READY');
  }

  private setPhase(phase: Phase): void {
    const prev = this.phase;
    this.phase = phase;
    this.phaseTime = 0;
    this.events.onPhaseChange?.(phase, prev);
  }
}
