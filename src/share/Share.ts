/**
 * SNS 共有（サーバーなし）。各サービスの公式の投稿用 URL（intent）と Web Share API を使う。
 */

export interface ShareRecord {
  cleared: number;
  score: number;
  nearMisses: number;
  survivalTime: number;
  comment: string;
  seed: number;
  isNewBest: boolean;
}

export const HASHTAG = '的逃走中';
export const GAME_TITLE = '的、逃走中。';

/** 共有する URL（クエリ・ハッシュは付けない。debug などのパラメータも消す） */
export function buildShareUrl(base: string): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function buildShareText(r: ShareRecord): string {
  const lines = [
    `『${GAME_TITLE}』で${r.cleared}人抜き！${r.isNewBest ? '（自己ベスト更新）' : ''}`,
    `スコア ${r.score.toLocaleString('ja-JP')}／ニアミス ${r.nearMisses}回／生存 ${r.survivalTime.toFixed(1)}秒`,
    `清掃員の評価「${r.comment}」`,
    `あなたは何人抜けますか？→`,
  ];
  return lines.join('\n');
}

const enc = encodeURIComponent;

export function xIntentUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}&hashtags=${enc(HASHTAG)}`;
}

export function lineShareUrl(text: string, url: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${enc(url)}&text=${enc(text)}`;
}

export function blueskyIntentUrl(text: string, url: string): string {
  return `https://bsky.app/intent/compose?text=${enc(`${text} ${url} #${HASHTAG}`)}`;
}

export function fullShareText(text: string, url: string): string {
  return `${text}\n${url}\n#${HASHTAG}`;
}

/** 新しいタブで開く（ポップアップブロック時は同じタブで遷移しない＝ゲームを失わない） */
export function openIntent(url: string): boolean {
  try {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    return w !== null;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 下のフォールバックへ
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Web Share API（スマホのOS共有シート）。画像を添付できれば添付する */
export async function nativeShare(text: string, url: string, image: Blob | null): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    const data: ShareData = { title: GAME_TITLE, text: `${text}\n#${HASHTAG}`, url };
    if (image) {
      const file = new File([image], 'mato-result.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) data.files = [file];
    }
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
