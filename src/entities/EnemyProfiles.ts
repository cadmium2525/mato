export type EnemyKind = 'salaryman' | 'drunk' | 'elderly' | 'muscle';

export const ENEMY_KINDS: readonly EnemyKind[] = ['salaryman', 'drunk', 'elderly', 'muscle'];

export interface EnemyProfile {
  kind: EnemyKind;
  /** 表示名 */
  name: string;
  /** 排尿時間（予備動作を除く） */
  durationSeconds: number;
  /** 照準点の最大移動速度 m/s（的の移動速度より遅いこと） */
  trackingSpeed: number;
  /** 的の位置を何秒遅れで認識するか */
  reactionDelaySeconds: number;
  /** 照準の連続的な揺れの振幅 m */
  aimNoise: number;
  /** 着弾判定半径 m */
  impactRadius: number;
  /** 発射から着弾までの飛行時間 */
  timeToImpact: number;
  /** 照準が出てから発射開始までの予備動作 */
  windupSeconds: number;
  /** 照準の左右揺れ（酔っ払い）。時間連続の正弦波。0なら無効 */
  sway: { amplitude: number; frequency: number };
  /** 断続発射（おじいちゃん）。onSeconds=0 なら連続発射 */
  pulse: { onSeconds: number; offSeconds: number; warningSeconds: number };
  /** 外見 */
  look: {
    height: number;
    build: number;
    shirt: number;
    jacket: number;
    pants: number;
    skin: number;
    hair: number;
    accent: number;
    stoop: number;
  };
}

/**
 * 4人の敵の設定。
 * Phase 1 ではサラリーマンが完成形。他3人は数値（時間・追尾・揺れ・断続・着弾半径）を
 * 共通コントローラで反映済みだが、以下は Phase 2 の TODO:
 * - TODO(phase2): muscle の跳ね返り二次Impactと発動予兆
 * - TODO(phase2): drunk / elderly の予兆演出の調整と攻撃パターンとの組み合わせ調整
 */
export const ENEMY_PROFILES: Record<EnemyKind, EnemyProfile> = {
  salaryman: {
    kind: 'salaryman',
    name: 'サラリーマン',
    durationSeconds: 8,
    trackingSpeed: 0.34,
    reactionDelaySeconds: 0.18,
    aimNoise: 0.006,
    impactRadius: 0.026,
    timeToImpact: 0.28,
    windupSeconds: 0.9,
    sway: { amplitude: 0, frequency: 0 },
    pulse: { onSeconds: 0, offSeconds: 0, warningSeconds: 0 },
    look: {
      height: 1.72, build: 1, shirt: 0xf2f2ee, jacket: 0x222a3a, pants: 0x222a3a,
      skin: 0xe0b394, hair: 0x1a1a1a, accent: 0xa3202a, stoop: 0,
    },
  },
  drunk: {
    kind: 'drunk',
    name: '酔っ払い',
    durationSeconds: 10,
    trackingSpeed: 0.26,
    reactionDelaySeconds: 0.32,
    aimNoise: 0.01,
    impactRadius: 0.027,
    timeToImpact: 0.3,
    windupSeconds: 1.0,
    sway: { amplitude: 0.07, frequency: 0.45 },
    pulse: { onSeconds: 0, offSeconds: 0, warningSeconds: 0 },
    look: {
      height: 1.7, build: 1.05, shirt: 0xe8e2d0, jacket: 0x5a4632, pants: 0x3b3b40,
      skin: 0xe89a86, hair: 0x2b2018, accent: 0x2a5aa0, stoop: 0.08,
    },
  },
  elderly: {
    kind: 'elderly',
    name: 'おじいちゃん',
    durationSeconds: 12,
    trackingSpeed: 0.22,
    reactionDelaySeconds: 0.4,
    aimNoise: 0.005,
    impactRadius: 0.024,
    timeToImpact: 0.3,
    windupSeconds: 1.1,
    sway: { amplitude: 0, frequency: 0 },
    pulse: { onSeconds: 1.4, offSeconds: 1.1, warningSeconds: 0.45 },
    look: {
      height: 1.6, build: 0.92, shirt: 0xd9d3c0, jacket: 0x9c8a6a, pants: 0x5b5548,
      skin: 0xd9ab8c, hair: 0xc8c8c8, accent: 0x6b4a2a, stoop: 0.22,
    },
  },
  muscle: {
    kind: 'muscle',
    name: 'マッチョ',
    durationSeconds: 7,
    trackingSpeed: 0.3,
    reactionDelaySeconds: 0.22,
    aimNoise: 0.007,
    impactRadius: 0.038,
    timeToImpact: 0.22,
    windupSeconds: 0.9,
    sway: { amplitude: 0, frequency: 0 },
    pulse: { onSeconds: 0, offSeconds: 0, warningSeconds: 0 },
    look: {
      height: 1.82, build: 1.15, shirt: 0x1c1c1c, jacket: 0x1c1c1c, pants: 0x34404e,
      skin: 0xc98f6c, hair: 0x111111, accent: 0xe8e8e8, stoop: 0,
    },
  },
};

export function getProfile(kind: EnemyKind): EnemyProfile {
  return ENEMY_PROFILES[kind];
}

/** 設定値が妥当かを検査する（テスト・起動時チェック用）。問題点の配列を返す */
export function validateProfile(p: EnemyProfile, playerSpeed: number): string[] {
  const errors: string[] = [];
  const positive: Array<[string, number]> = [
    ['durationSeconds', p.durationSeconds],
    ['trackingSpeed', p.trackingSpeed],
    ['impactRadius', p.impactRadius],
    ['timeToImpact', p.timeToImpact],
    ['windupSeconds', p.windupSeconds],
  ];
  for (const [key, value] of positive) {
    if (!(Number.isFinite(value) && value > 0)) errors.push(`${p.kind}.${key} must be > 0`);
  }
  if (!(p.reactionDelaySeconds >= 0 && p.reactionDelaySeconds < 1.5)) errors.push(`${p.kind}.reactionDelaySeconds out of range`);
  if (!(p.aimNoise >= 0 && p.aimNoise < 0.05)) errors.push(`${p.kind}.aimNoise out of range`);
  if (p.trackingSpeed >= playerSpeed) errors.push(`${p.kind}.trackingSpeed must be slower than the player`);
  if (p.sway.amplitude < 0 || p.sway.frequency < 0) errors.push(`${p.kind}.sway must be >= 0`);
  if (p.pulse.onSeconds > 0 && !(p.pulse.offSeconds > p.pulse.warningSeconds && p.pulse.warningSeconds > 0)) {
    errors.push(`${p.kind}.pulse needs offSeconds > warningSeconds > 0`);
  }
  if (!p.name) errors.push(`${p.kind}.name is empty`);
  return errors;
}
