#!/usr/bin/env node
/*
 * PV の BGM（かなでる の曲 JSON）を作るスクリプト。
 *   node pv/bgm.gen.mjs > pv/bgm.json
 *   node <mp4mp3>/daw/tools/render.mjs pv/bgm.json pv/media/bgm.wav --report
 *
 * 132 BPM・F メジャーの、とぼけた「おっかけっこ」風。映像の区切り（拍）に合わせて構成する。
 *  0–12拍  冒頭のプレイ（フル）
 * 12–20拍  導入の文字（ブレイク: パッドとオルゴールだけ、真顔の間）
 * 20–50拍  行列 → キャラ紹介 → 1人抜き（フル＋区切りごとにアクセント）
 * 50拍〜   命中 → 音楽が止まって「残念」のトロンボーン → 66拍からエンディング
 */
const HIT = Number(process.env.HIT_BEAT ?? 52); // 命中の瞬間（拍）
const CLEAR = Number(process.env.CLEAR_BEAT ?? 47.5); // 「1人抜き！」が出る瞬間（拍）
const END = 68;
const CUTS = [26, 32, 38, 44]; // キャラ紹介の切り替わり

const chords = ['F', 'Dm', 'Bb', 'C']; // 1小節ずつ
const root = { F: 'F2', Dm: 'D2', Bb: 'Bb1', C: 'C2' };
const fifth = { F: 'C3', Dm: 'A2', Bb: 'F2', C: 'G2' };
const stab = { F: ['A3', 'C4', 'F4'], Dm: ['A3', 'D4', 'F4'], Bb: ['Bb3', 'D4', 'F4'], C: ['G3', 'C4', 'E4'] };

function groove(fromBar, toBar) {
  const bass = [];
  const keys = [];
  for (let bar = fromBar; bar < toBar; bar++) {
    const c = chords[bar % 4];
    const b = bar * 4;
    // ブンチャッ（チューバ風のベース＋裏打ちの和音）
    bass.push([b, root[c], 0.45, 0.9], [b + 1, fifth[c], 0.45, 0.7], [b + 2, root[c], 0.45, 0.85], [b + 3, fifth[c], 0.4, 0.7]);
    if (bar % 2 === 1) bass.push([b + 3.5, fifth[c].replace(/\d/, (d) => String(Number(d))), 0.25, 0.6]);
    for (const off of [0.5, 1.5, 2.5, 3.5]) for (const n of stab[c]) keys.push([b + off, n, 0.22, 0.55]);
  }
  return { bass, keys };
}

// とぼけたメロディー（マリンバ）。2小節フレーズ
const phraseA = [
  [0, 'C5', 0.5], [0.5, 'F5', 0.5], [1, 'A5', 0.5], [1.5, 'G5', 0.25], [1.75, 'F5', 0.25], [2, 'G5', 0.75], [3, 'C5', 0.5], [3.5, 'D5', 0.5],
  [4, 'F5', 0.5], [4.5, 'A5', 0.5], [5, 'Bb5', 0.5], [5.5, 'A5', 0.25], [5.75, 'G5', 0.25], [6, 'F5', 1], [7.5, 'C5', 0.5],
];
const phraseB = [
  [0, 'A5', 0.25], [0.25, 'A5', 0.25], [0.5, 'G5', 0.5], [1, 'F5', 0.5], [1.5, 'D5', 0.5], [2, 'E5', 0.5], [2.5, 'G5', 0.5], [3, 'C6', 0.75],
  [4, 'Bb5', 0.5], [4.5, 'A5', 0.5], [5, 'G5', 0.5], [5.5, 'E5', 0.5], [6, 'F5', 0.75], [7, 'C5', 0.25], [7.25, 'F5', 0.25], [7.5, 'A5', 0.5],
];
const melody = [];
const addPhrase = (at, phrase, vel = 0.75) => phrase.forEach(([t, n, d]) => melody.push([at + t, n, d * 0.9, vel]));
addPhrase(0, phraseA);
addPhrase(8, phraseA.slice(0, 7));
addPhrase(20, phraseB);
addPhrase(28, phraseA);
addPhrase(36, phraseB);
addPhrase(44, phraseA.slice(0, Math.max(1, phraseA.findIndex(([t]) => 44 + t >= HIT - 0.25))));
addPhrase(60, phraseA, 0.8);

const g1 = groove(0, 3);
const g2 = groove(5, Math.floor(HIT / 4));
// 命中の直前の小節は命中の拍で切る
const cut = (notes) => notes.filter(([t, , d]) => t + d <= HIT);
const g3 = groove(15, 16); // エンディングの1小節
const bassNotes = cut([...g1.bass, ...g2.bass, ...groove(Math.floor(HIT / 4), Math.ceil(HIT / 4)).bass]).concat(g3.bass, [[64, 'F1', 3.5, 0.95]]);
const keyNotes = cut([...g1.keys, ...g2.keys, ...groove(Math.floor(HIT / 4), Math.ceil(HIT / 4)).keys]).concat(g3.keys, [[64, 'A3', 3, 0.7], [64, 'C4', 3, 0.7], [64, 'F4', 3, 0.7]]);
const melodyNotes = melody.filter(([t, , d]) => t < HIT - 0.01 || t >= 60).map(([t, n, d, v]) => [t, n, t < HIT && t + d > HIT ? HIT - t : d, v]);

// ドラム
const groove16 = { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' };
const fill16 = { kick: 'x.......x.......', snare: '....x.....x.xxxx', hat: 'x.x.x.x.x.x.....' };
const drumClips = [];
const pushBar = (bar, pat) => drumClips.push({ at: bar * 4, len: 4, grid: pat, res: 0.25 });
for (let bar = 0; bar < 3; bar++) pushBar(bar, bar === 2 ? fill16 : groove16);
for (let bar = 5; bar < Math.floor(HIT / 4); bar++) pushBar(bar, bar % 2 === 0 ? fill16 : groove16);
pushBar(15, fill16);
drumClips.push({ at: 64, len: 4, grid: { kick: 'X...............', crash: 'X...............' }, res: 0.25 });

// 効果音
const sfx = [];
sfx.push({ at: 11.5, sfx: { preset: 'whoosh', length: 0.7 }, gain: -8 });
sfx.push({ at: 18.2, sfx: { preset: 'drumroll', length: 0.8 }, gain: -10 });
for (const c of CUTS) sfx.push({ at: c - 0.15, sfx: { preset: 'swipe', length: 0.5, tone: 0.3 }, gain: -12 });
sfx.push({ at: CLEAR, sfx: { preset: 'success', length: 1 }, gain: -6 });
sfx.push({ at: HIT, sfx: { preset: 'boing', pitch: -5, length: 1.1 }, gain: -2 });
sfx.push({ at: HIT, sfx: { preset: 'impact', length: 0.6, punch: 0.4 }, gain: -10 });
sfx.push({ at: 59.6, sfx: { preset: 'riser', length: 0.9 }, gain: -10 });

// 尿の「シャー」（プレイ映像の区間だけ、BGM の下に薄く）
const stream = (len) => ({
  layers: [
    { src: 'pink', filter: { type: 'bp', freq: [[0, 1700], [len * 0.5, 2300, 'smooth'], [len, 1900, 'smooth']], q: 0.9 }, amp: [[0, 0], [0.08, 1], [len - 0.15, 1], [len, 0]], gain: -6, width: 0.4 },
    { src: 'crackle', density: 45, filter: { type: 'hp', freq: 2500 }, amp: [[0, 0], [0.08, 1], [len - 0.15, 1], [len, 0]], gain: -16 },
  ],
  normalize: -6,
});
const streamTrack = [
  { at: 0, sfx: stream(5.4), gain: 0 },
  { at: 26, sfx: stream(2.7), gain: 0 },
  { at: 32, sfx: stream(2.7), gain: 0 },
  { at: 38, sfx: stream(2.7), gain: 0 },
  { at: 44, sfx: stream((HIT - 44) / 2.2 - 0.05), gain: 0 },
];

// 命中後の「残念」トロンボーン（ワーワーワーワ〜）
const sad = [
  [HIT + 1, 'Bb3', 0.9, 0.7], [HIT + 2, 'A3', 0.9, 0.7], [HIT + 3, 'Ab3', 0.9, 0.7], [HIT + 4, 'G3', 3, 0.75],
];

const song = {
  name: '的、逃走中。PV',
  bpm: 132,
  sig: [4, 4],
  bars: END / 4,
  key: 'F major',
  sends: { reverb: { size: 1.1, decay: 1.6, damp: 7000, predelay: 0.02 }, delay: { time: '1/8d', feedback: 0.25 } },
  master: { loudness: -15, ceiling: -1, fadeOut: 1.2 },
  tracks: [
    { id: 'bass', name: 'チューバ風ベース', inst: 'pluckbass', volume: -1, clips: [{ at: 0, notes: bassNotes }] },
    { id: 'keys', name: '裏打ち', inst: 'pizz', volume: -6, pan: -0.2, sends: { reverb: 0.15 }, clips: [{ at: 0, notes: keyNotes }] },
    { id: 'mel', name: 'マリンバ', inst: 'marimba', volume: 0, pan: 0.15, sends: { reverb: 0.2, delay: 0.08 }, humanize: { time: 0.006, vel: 0.05 }, clips: [{ at: 0, notes: melodyNotes }] },
    {
      id: 'brk',
      name: 'ブレイクのオルゴール',
      inst: 'musicbox',
      volume: -4,
      sends: { reverb: 0.35 },
      clips: [{ at: 12, notes: [[0, 'F5', 1.5, 0.5], [2, 'E5', 1.5, 0.45], [4, 'D5', 1.5, 0.45], [6, 'C5', 1, 0.45], [7, 'A4', 0.5, 0.4]] }],
    },
    { id: 'pad', name: 'パッド', inst: 'airpad', volume: -10, sends: { reverb: 0.4 }, clips: [{ at: 12, notes: [[0, ['F3', 'A3', 'C4'], 4, 0.5], [4, ['D3', 'F3', 'A3', 'C4'], 4, 0.5]] }] },
    { id: 'sad', name: 'トロンボーン', inst: 'brass', volume: -3, sends: { reverb: 0.25 }, clips: [{ at: 0, notes: sad }] },
    { id: 'glock', name: 'グロッケン', inst: 'glock', volume: -9, sends: { reverb: 0.3 }, clips: [{ at: 0, notes: [[0, 'F6', 0.5, 0.6], [20, 'F6', 0.5, 0.6], [64, 'F6', 2, 0.7], [64, 'C6', 2, 0.6]] }] },
    { id: 'drums', name: 'ドラム', kit: 'acoustic', volume: -3, clips: drumClips },
    { id: 'fx', name: '効果音', type: 'sfx', volume: -2, clips: sfx },
    { id: 'pee', name: 'シャー', type: 'sfx', volume: -17, clips: streamTrack },
  ],
};
process.stdout.write(JSON.stringify(song, null, 1));
