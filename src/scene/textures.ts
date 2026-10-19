import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/** 目地付きのタイル */
export function tileTexture(base: string, grout: string, tiles: number, repeatX: number, repeatY: number): CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  const step = size / tiles;
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const shade = 0.96 + ((i * 7 + j * 13) % 5) * 0.01;
      ctx.fillStyle = base;
      ctx.globalAlpha = 1;
      ctx.fillRect(i * step + 2, j * step + 2, step - 4, step - 4);
      ctx.fillStyle = `rgba(0,0,0,${(1 - shade).toFixed(3)})`;
      ctx.fillRect(i * step + 2, j * step + 2, step - 4, step - 4);
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/** 赤白の的 */
export function targetTexture(): CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size, size);
  const rings = ['#d61f26', '#ffffff', '#d61f26', '#ffffff', '#d61f26'];
  for (let i = 0; i < rings.length; i++) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, (size / 2) * (1 - i / rings.length), 0, Math.PI * 2);
    ctx.fillStyle = rings[i];
    ctx.fill();
  }
  ctx.strokeStyle = '#7a0d12';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
