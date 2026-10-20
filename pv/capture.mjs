#!/usr/bin/env node
/*
 * PV 用のプレイ映像を撮影する。ゲームを撮影モード（?debug&capture）で開き、
 * 1/30 秒ずつ時間を進めて 1 コマずつ撮り、ffmpeg で MP4 にする（ソフトウェア描画でもカクつかない）。
 *
 *   node pv/capture.mjs <ゲームのURL> <出力フォルダ> [クリップ名...]
 *   例: node pv/capture.mjs http://localhost:4173/mato/ pv/media open intro
 */
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim();
  playwright = require(join(g, 'playwright'));
}

const [base, outDir, ...only] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('使い方: node pv/capture.mjs <ゲームのURL> <出力フォルダ> [クリップ名...]');
  process.exit(1);
}
const FPS = 30;
const STEP = 1000 / FPS;
const VIEW = { width: 540, height: 960 }; // ×2 で 1080×1920（9:16）

/** 各場面。setup で撮り始めの状態まで早送りし、record 秒（または until まで）撮る */
const CLIPS = {
  // 冒頭: 2WAY のサラリーマン。隙間に入り、閉じる前に抜ける
  open: { params: 'seed=9&attack=twoWay&autopilot&god', start: 'play', at: 1.4, record: 5.5 },
  // 導入の文字と、順番待ちの列
  intro: { params: 'seed=9', start: 'intro', at: 0.3, record: 3.2 },
  queue: { params: 'seed=9', start: 'queue', at: 0.0, record: 2.6 },
  // キャラ別の癖
  drunk: { params: 'seed=1&attack=threeWay&autopilot&god', start: 'play', at: 1.6, record: 3.6 },
  elderly: { params: 'seed=2&attack=single&autopilot&god', start: 'play', at: 1.4, record: 3.8 },
  muscle: { params: 'seed=3&attack=shotgun&autopilot&god', start: 'play', at: 1.1, record: 3.8 },
  // 1人抜き（排尿の終わり → クリア表示）
  clear: { params: 'seed=11&attack=single&autopilot&god', start: 'play', at: 7.7, record: 2.6 },
  // 命中 → ゲームオーバー（自動操縦を切って当たる）
  hit: { params: 'seed=21&attack=single&autopilot', start: 'play', at: 2.2, hit: true, after: 3.8 },
  // タイトル画面（締め）
  title: { params: 'seed=9', start: 'title', at: 0.8, record: 3.0 },
};

// 操作の案内は PV では消す（テロップと重なるため）
const HIDE = '.hud-help, .hud-pause, .hud-sound, .audio-debug, .intro-skip { display: none !important; }';

async function capture(browser, name, clip) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 初回ヒントは出さない・画質は高
  await page.addInitScript(() => {
    localStorage.setItem('mato.settings.v1', JSON.stringify({ sound: true, quality: 'high', shortCinematics: false, tutorialSeen: true }));
  });
  await page.goto(`${base}?debug&capture&${clip.params}`);
  await page.waitForFunction(() => window.__MATO__);
  await page.addStyleTag({ content: HIDE });
  const st = () => page.evaluate(() => window.__MATO__.state());
  const adv = (ms, render) => page.evaluate(([ms, r]) => window.__MATO__.advance(ms, r), [ms, render]);
  const ff = async (pred, limit = 120) => {
    for (let t = 0; t < limit; t += 0.05) {
      if (pred(await st())) return;
      await adv(50, false);
    }
    throw new Error(`${name}: 早送りで条件に届かない ${JSON.stringify(await st())}`);
  };
  const press = (key) => page.keyboard.press(key);

  await adv(STEP, true);
  if (clip.start !== 'title') {
    await press('Enter');
    if (clip.start === 'intro') await ff((s) => s.phase === 'INTRO' && s.phaseTime >= clip.at);
    else if (clip.start === 'queue') {
      await ff((s) => s.phase === 'INTRO');
      await press('Enter');
      await ff((s) => s.phase === 'QUEUE_PAN' && s.phaseTime >= clip.at);
    } else {
      await ff((s) => s.phase === 'INTRO');
      await press('Enter');
      await ff((s) => s.phase === 'QUEUE_PAN');
      await press('Enter');
      await ff((s) => s.phase === 'PLAYING' && s.phaseTime >= clip.at);
    }
  } else {
    await ff((s) => s.phase === 'TITLE' && false, clip.at).catch(() => undefined);
  }

  const dir = join(outDir, `${name}_frames`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (clip.hit) await page.evaluate(() => window.__MATO__.setAutopilot(false));
  let n = 0;
  let overAt = null;
  const maxFrames = clip.record ? Math.round(clip.record * FPS) : 30 * FPS;
  while (n < maxFrames) {
    await adv(STEP, true);
    await page.screenshot({ path: join(dir, `${String(n).padStart(5, '0')}.png`) });
    n += 1;
    if (clip.hit) {
      const s = await st();
      if (s.phase === 'GAME_OVER' && overAt === null) overAt = n;
      if (overAt !== null && n - overAt >= clip.after * FPS) break;
    }
  }
  await page.close();
  const out = join(outDir, `${name}.mp4`);
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, '%05d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) throw new Error(`${name}: ffmpeg に失敗`);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name}: ${n} コマ（${(n / FPS).toFixed(2)} 秒）→ ${out}${errors.length ? ` 警告: ${errors.join(' / ')}` : ''}`);
}

mkdirSync(outDir, { recursive: true });
const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const names = only.length ? only : Object.keys(CLIPS);
  for (const name of names) {
    if (!CLIPS[name]) throw new Error(`未知のクリップ: ${name}`);
    const t0 = Date.now();
    await capture(browser, name, CLIPS[name]);
    console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} 秒かかりました)`);
  }
} finally {
  await browser.close();
}
if (!existsSync(outDir)) process.exit(1);
