import { describe, expect, it } from 'vitest';
import { QueueManager } from '../src/entities/QueueManager';
import { GameConfig } from '../src/game/GameConfig';
import type { Phase } from '../src/game/GameState';
import { RoundDirector } from '../src/game/RoundDirector';

function advanceTo(d: RoundDirector, phase: Phase, maxSeconds = 30): void {
  for (let t = 0; t < maxSeconds && d.phase !== phase; t += 0.05) d.update(0.05);
  expect(d.phase).toBe(phase);
}

describe('QueueManager', () => {
  it('同じシードなら同じ待機列になる', () => {
    const a = new QueueManager(1234, 8);
    const b = new QueueManager(1234, 8);
    const seqA = Array.from({ length: 30 }, () => a.next().kind);
    const seqB = Array.from({ length: 30 }, () => b.next().kind);
    expect(seqA).toEqual(seqB);
  });

  it('違うシードなら（ほぼ確実に）違う列になる', () => {
    const a = new QueueManager(1, 8);
    const b = new QueueManager(2, 8);
    const seqA = Array.from({ length: 30 }, () => a.next().kind).join();
    const seqB = Array.from({ length: 30 }, () => b.next().kind).join();
    expect(seqA).not.toEqual(seqB);
  });

  it('表示キュー(peek)と消費キュー(next)が一致する', () => {
    const q = new QueueManager(42, 8);
    for (let round = 0; round < 20; round++) {
      const shown = q.peek(5).map((e) => ({ ...e }));
      const consumed = q.next();
      expect(consumed).toEqual(shown[0]);
      // 残りの表示も1つずつ前に詰まるだけ
      expect(q.peek(4)).toEqual(shown.slice(1));
    }
  });

  it('通し番号は1から連番', () => {
    const q = new QueueManager(5, 4);
    expect([q.next().serial, q.next().serial, q.next().serial]).toEqual([1, 2, 3]);
  });
});

describe('RoundDirector', () => {
  it('初回は INTRO → QUEUE_PAN → ROUND_READY → PLAYING と進む', () => {
    const d = new RoundDirector();
    d.startGame(10);
    expect(d.phase).toBe('INTRO');
    advanceTo(d, 'QUEUE_PAN');
    advanceTo(d, 'ROUND_READY');
    expect(d.enemyNumber).toBe(1);
    advanceTo(d, 'PLAYING');
  });

  it('生存して排尿終了なら人数+1、被弾したラウンドは+0', () => {
    const d = new RoundDirector();
    d.startGame(10);
    d.skip();
    d.skip();
    advanceTo(d, 'PLAYING');
    d.completeRound();
    expect(d.cleared).toBe(1);
    expect(d.phase).toBe('ROUND_CLEAR');
    advanceTo(d, 'ROUND_READY');
    expect(d.enemyNumber).toBe(2);
    advanceTo(d, 'PLAYING');
    d.registerHit();
    expect(d.phase).toBe('HIT');
    expect(d.cleared).toBe(1);
    // 被弾後の completeRound は無効
    d.completeRound();
    expect(d.cleared).toBe(1);
    advanceTo(d, 'GAME_OVER');
  });

  it('登場する相手は待機列の先頭と一致する', () => {
    const d = new RoundDirector();
    d.startGame(99);
    d.skip();
    const expected = d.upcoming(3).map((e) => e.serial);
    const actual: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (d.phase !== 'ROUND_READY') d.skip();
      advanceTo(d, 'ROUND_READY');
      actual.push(d.current!.serial);
      advanceTo(d, 'PLAYING');
      d.completeRound();
    }
    expect(actual).toEqual(expected);
  });

  it('同じシードで再開すると同じ待機列', () => {
    const d = new RoundDirector();
    d.startGame(777);
    const first = d.upcoming(6).map((e) => e.kind);
    d.toTitle();
    d.startGame(777);
    expect(d.upcoming(6).map((e) => e.kind)).toEqual(first);
  });

  it('リトライでは導入を省略し、列の演出も短縮される', () => {
    const d = new RoundDirector();
    d.startGame(1);
    expect(d.phase).toBe('INTRO');
    expect(d.queuePanSeconds).toBe(GameConfig.timing.queuePanFirst);
    d.startGame(2);
    expect(d.phase).toBe('QUEUE_PAN');
    expect(d.queuePanSeconds).toBe(GameConfig.timing.queuePanRetry);
  });

  it('ポーズ中は時間が進まず、再開で元の状態に戻る', () => {
    const d = new RoundDirector();
    d.startGame(3);
    d.skip();
    d.skip();
    expect(d.phase).toBe('ROUND_READY');
    d.update(0.5);
    expect(d.pause()).toBe(true);
    expect(d.phase).toBe('PAUSED');
    d.update(100);
    d.resume();
    expect(d.phase).toBe('ROUND_READY');
    expect(d.phaseTime).toBeCloseTo(0.5);
  });

  it('TITLE や GAME_OVER ではポーズしない', () => {
    const d = new RoundDirector();
    expect(d.pause()).toBe(false);
    expect(d.phase).toBe('TITLE');
  });
});
