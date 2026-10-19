/**
 * 調整可能な定数をすべてここに集める（仮値。プレイテストで変更する）。
 * 距離の単位はメートル、時間の単位は秒。
 */
export const GameConfig = {
  simulation: {
    /** 判定を安定させるための固定ステップ */
    fixedStep: 1 / 120,
    /** タブ復帰などで dt が巨大になったときの上限 */
    maxFrameDelta: 0.1,
  },

  /** 小便器内壁（プレイ可能領域）の形状 */
  surface: {
    /** 楕円柱の横半径 / 奥行き半径 */
    radiusX: 0.2,
    radiusZ: 0.24,
    /** 楕円柱の中心軸の z 座標（壁面は z=0） */
    centerZ: 0.34,
    /** プレイ可能領域の左右端の角度（度） */
    thetaMaxDeg: 62,
    /** プレイ可能領域の下端の高さと縦の長さ */
    yBottom: 0.56,
    height: 0.46,
  },

  player: {
    /** 便器の横幅を横断するのにかかる秒数 */
    crossSeconds: 0.7,
    /** 見た目の的の半径 */
    visualRadius: 0.032,
    /** 判定半径 = 見た目 × この値（10〜20%小さく） */
    hitRadiusScale: 0.85,
    startU: 0.5,
    startV: 0.42,
  },

  attack: {
    /** 尿の着弾イベントを生成する間隔 */
    emitInterval: 1 / 60,
    /** 1つの着弾が判定を持つ時間 */
    impactLifetime: 0.09,
    /** ニアミス判定用に1本の尿流を区切る長さ */
    streamSegmentSeconds: 0.6,
    /** 尿の放物線の膨らみ（見た目のみ） */
    arcHeight: 0.05,
    /** 尿の発射口（プレイ中カメラの画面外下方） */
    origin: { x: 0, y: 0.64, z: 0.86 },
  },

  nearMiss: {
    /** 判定円の外側この幅のリングに入って出たらニアミス */
    ringWidth: 0.03,
    /** 連続ニアミスとみなす間隔 */
    streakWindow: 1.5,
  },

  timing: {
    intro: 3.6,
    queuePanFirst: 2.6,
    queuePanRetry: 1.0,
    roundReady: 1.7,
    /** ROUND_READY 中、この秒数までは引きの画で入場を見せる */
    roundReadyApproach: 0.85,
    roundClear: 1.2,
    hitSlowmo: 0.5,
  },

  queue: {
    /** 常に確保しておく待機人数 */
    minUpcoming: 8,
    /** 3D上で並ばせる人数 */
    visibleSlots: 5,
    /** HUDに出す「次の人」の人数 */
    hudPreview: 4,
  },

  score: {
    perSecond: 10,
    nearMiss: 100,
    nearMissStreak3: 300,
    roundClear: 500,
  },

  /** 仮想スティック（px）。radius だけ指を動かすと最高速 */
  touch: {
    radius: 56,
    deadzone: 6,
  },

  render: {
    maxPixelRatio: 2,
    /** スマホは発熱・電池を考慮して抑える */
    maxPixelRatioTouch: 1.5,
    shadowMapSize: 1024,
  },
} as const;

export type GameConfigType = typeof GameConfig;
