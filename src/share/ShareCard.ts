import { GAME_TITLE, HASHTAG, type ShareRecord } from './Share';

const W = 1200;
const H = 630;
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif';

/**
 * SNS 用の記録カード画像（1200×630）を Canvas 2D で描く。外部フォント・画像は使わない。
 * snapshot にはゲームオーバー時の3D画面を渡す（無ければ省略）。
 */
export function drawShareCard(r: ShareRecord, snapshot: HTMLCanvasElement | null, url: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  // 背景: タイル
  ctx.fillStyle = '#c9d0d4';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // 左: スナップショット
  const shotX = 40;
  const shotY = 40;
  const shotW = 520;
  const shotH = H - 80;
  ctx.fillStyle = '#e8ecee';
  ctx.fillRect(shotX, shotY, shotW, shotH);
  if (snapshot && snapshot.width > 0 && snapshot.height > 0) {
    // 中央をトリミングして収める
    const sr = snapshot.width / snapshot.height;
    const dr = shotW / shotH;
    let sw = snapshot.width;
    let sh = snapshot.height;
    if (sr > dr) sw = sh * dr;
    else sh = sw / dr;
    ctx.drawImage(snapshot, (snapshot.width - sw) / 2, (snapshot.height - sh) / 2, sw, sh, shotX, shotY, shotW, shotH);
  } else {
    drawTarget(ctx, shotX + shotW / 2, shotY + shotH / 2, 120);
  }
  ctx.strokeStyle = '#9aa5ab';
  ctx.lineWidth = 2;
  ctx.strokeRect(shotX, shotY, shotW, shotH);

  // 右: 案内板
  const px = 600;
  const py = 40;
  const pw = W - px - 40;
  const ph = H - 80;
  ctx.fillStyle = 'rgba(250,251,251,0.97)';
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = '#1f5fa8';
  ctx.fillRect(px, py, pw, 16);

  drawTarget(ctx, px + 52, py + 72, 26);
  ctx.fillStyle = '#23292e';
  ctx.font = `800 40px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(GAME_TITLE, px + 92, py + 72);

  ctx.fillStyle = '#c8242b';
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText('GAME OVER', px + 32, py + 140);

  ctx.fillStyle = '#23292e';
  ctx.font = `800 96px ${FONT}`;
  ctx.fillText(`${r.cleared}人抜き！`, px + 28, py + 220, pw - 56);

  if (r.isNewBest) {
    ctx.fillStyle = '#1f8a4c';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText('自己ベスト更新！', px + 32, py + 292);
  }

  ctx.fillStyle = '#66717a';
  ctx.font = `600 24px ${FONT}`;
  const stats = [
    ['スコア', r.score.toLocaleString('ja-JP')],
    ['ニアミス', `${r.nearMisses} 回`],
    ['生存時間', `${r.survivalTime.toFixed(1)} 秒`],
  ];
  stats.forEach(([k, v], i) => {
    const y = py + 330 + i * 36;
    ctx.fillStyle = '#66717a';
    ctx.fillText(k, px + 32, y);
    ctx.fillStyle = '#23292e';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(v, px + 170, y);
    ctx.font = `600 24px ${FONT}`;
  });

  ctx.fillStyle = '#eef2f4';
  ctx.fillRect(px + 24, py + 430, pw - 48, 66);
  ctx.fillStyle = '#66717a';
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText('清掃員からの評価', px + 38, py + 448);
  ctx.fillStyle = '#23292e';
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText(`「${r.comment}」`, px + 34, py + 476, pw - 76);

  ctx.fillStyle = '#66717a';
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText(`#${HASHTAG}  SEED ${r.seed}`, px + 32, py + ph - 22);
  ctx.textAlign = 'right';
  ctx.fillText(url.replace(/^https?:\/\//, ''), px + pw - 24, py + ph - 22, pw * 0.55);
  ctx.textAlign = 'left';
  return c;
}

function drawTarget(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const colors = ['#d61f26', '#ffffff', '#d61f26', '#ffffff', '#d61f26'];
  colors.forEach((col, i) => {
    ctx.beginPath();
    ctx.arc(x, y, r * (1 - i / colors.length), 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  });
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
