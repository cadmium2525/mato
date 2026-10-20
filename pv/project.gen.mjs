#!/usr/bin/env node
/*
 * PV の編集内容（つなぐ のプロジェクト JSON）を作る。撮影した素材の長さを ffprobe で読み、
 * BGM の拍（132 BPM）に合わせてカットを並べる。
 *   node pv/project.gen.mjs pv/media > pv/project.json
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const mediaDir = process.argv[2] ?? 'pv/media';
const BEAT = 60 / 132;
const HIT_BEAT = Number(process.env.HIT_BEAT ?? 52);
const dur = (name) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(mediaDir, `${name}.mp4`)], { encoding: 'utf8' });
  return Number(r.stdout.trim());
};
const b = (beats) => +(beats * BEAT).toFixed(4);

/** 区間 [fromBeat, toBeat) を素材 name の in から埋める（足りなければ速度を落として合わせる） */
function clip(name, fromBeat, toBeat, inPoint = 0, extra = {}) {
  const len = b(toBeat - fromBeat);
  const available = dur(name) - inPoint - 0.02;
  const speed = available >= len ? 1 : +(available / len).toFixed(4);
  return { media: name, in: +inPoint.toFixed(4), out: +(inPoint + len * speed).toFixed(4), speed, fit: 'cover', ...extra };
}

// 命中の瞬間（素材の中の秒）: 撮影は「ゲームオーバー後 after 秒」で止まる。命中→ゲームオーバーはスロー演出 0.5 秒
const HIT_AFTER = 3.8;
const hitT = dur('hit') - HIT_AFTER - 0.5;
const hitIn = Math.max(0, hitT - b(HIT_BEAT - 50));

const clips = [
  clip('open', 0, 12, 0),
  clip('intro', 12, 20, 0),
  clip('queue', 20, 26, 0),
  clip('drunk', 26, 32, 0.4),
  clip('elderly', 32, 38, 0.3),
  clip('muscle', 38, 44, 0.45),
  clip('clear', 44, 50, 0),
  clip('hit', 50, 60, hitIn),
  clip('title', 60, 68, 0),
];

const T = (text, fromBeat, toBeat, extra = {}) => ({ text, start: b(fromBeat), end: b(toBeat), ...extra });
const project = {
  version: 1,
  name: '的、逃走中。PV',
  width: 1080,
  height: 1920,
  fps: 30,
  background: '#000000',
  fadeOut: 0,
  media: Object.fromEntries(['open', 'intro', 'queue', 'drunk', 'elderly', 'muscle', 'clear', 'hit', 'title', 'bgm'].map((n) => [n, { name: n === 'bgm' ? 'bgm.wav' : `${n}.${process.env.MEDIA_EXT ?? 'webm'}` }])),
  clips,
  texts: [
    // 1コマ目からサムネイルとして読めるよう、出かたは none（フェードしない）
    T('あなたは、的。', 0, 6, { style: 'pop3d', size: 0.12, y: 0.335, anim: 'none' }),
    T('小便から\n逃げろ！', 6, 12, { style: 'telop', size: 0.1, y: 0.335, anim: 'pop' }),
    // ゲーム本来の導入文は縦長の画面だと小さいので、同じ文言を大きく重ねる
    T('あなたは的です。\n襲いかかってくる小便から\n逃げてください。', 12.3, 20, { style: 'telop', size: 0.064, y: 0.5, bg: 'rgba(0,0,0,0.55)', anim: 'fade' }),
    T('順番待ちの列から\n次々やってくる', 20, 26, { style: 'telop', size: 0.075, y: 0.86, anim: 'slide' }),
    T('酔っ払い', 26, 32, { style: 'label', size: 0.07, y: 0.81, anim: 'pop' }),
    T('照準がフラフラ＆3WAY', 26.5, 32, { style: 'telop', size: 0.062, y: 0.88, anim: 'fade' }),
    T('おじいちゃん', 32, 38, { style: 'label', size: 0.07, y: 0.81, anim: 'pop' }),
    T('止まった…と思ったら再開', 32.5, 38, { style: 'telop', size: 0.062, y: 0.88, anim: 'fade' }),
    T('マッチョ', 38, 44, { style: 'label', size: 0.07, y: 0.81, anim: 'pop' }),
    T('散弾＆跳ね返り', 38.5, 44, { style: 'telop', size: 0.062, y: 0.88, anim: 'fade' }),
    T('かわし切れば「1人抜き」', 44, 50, { style: 'yellow', size: 0.07, y: 0.86, anim: 'pop' }),
    T('何人抜けるか！？', HIT_BEAT + 2, 60, { style: 'pop3d', size: 0.1, y: 0.085, anim: 'pop' }),
    T('ブラウザで無料プレイ', 60.5, 68, { style: 'yellow', size: 0.07, y: 0.08, anim: 'pop' }),
    T('cadmium2525.github.io/mato', 61, 68, { style: 'label', size: 0.055, y: 0.92, anim: 'slide' }),
  ],
  effects: [
    { type: 'flash', start: b(HIT_BEAT), end: b(HIT_BEAT) + 0.35, intensity: 0.7 },
    { type: 'shake', start: b(HIT_BEAT), end: b(HIT_BEAT) + 0.5, intensity: 0.6 },
    { type: 'sparkle', start: b(47.5), end: b(50), intensity: 0.5 },
    { type: 'vignette', start: b(12), end: b(20), intensity: 0.5 },
  ],
  audios: [{ media: 'bgm', start: 0, volume: 1, fadeIn: 0, fadeOut: 0.6 }],
};
process.stdout.write(JSON.stringify(project, null, 1));
