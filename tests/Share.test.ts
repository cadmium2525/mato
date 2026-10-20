import { describe, expect, it } from 'vitest';
import {
  HASHTAG,
  blueskyIntentUrl,
  buildShareText,
  buildShareUrl,
  fullShareText,
  lineShareUrl,
  xIntentUrl,
  type ShareRecord,
} from '../src/share/Share';

const record: ShareRecord = {
  cleared: 23,
  score: 12345,
  nearMisses: 7,
  survivalTime: 201.4,
  comment: 'こんな的、見たことがない。',
  seed: 4242,
  isNewBest: true,
};

describe('buildShareText', () => {
  it('人数・スコア・ニアミス・清掃員の評価が入る', () => {
    const t = buildShareText(record);
    expect(t).toContain('的、逃走中。');
    expect(t).toContain('23人抜き');
    expect(t).toContain('12,345');
    expect(t).toContain('ニアミス 7回');
    expect(t).toContain('201.4秒');
    expect(t).toContain('こんな的、見たことがない。');
    expect(t).toContain('自己ベスト更新');
  });
  it('ベスト更新でなければその表記はない', () => {
    expect(buildShareText({ ...record, isNewBest: false })).not.toContain('自己ベスト更新');
  });
  it('X の上限（280字・日本語は2字換算）に収まる長さ', () => {
    const url = 'https://cadmium2525.github.io/mato/?seed=999999';
    const text = buildShareText({ ...record, cleared: 999, score: 99999999 });
    // URL は 23 字換算、ハッシュタグ込みで概算
    const weighted = [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0) + 23 + HASHTAG.length * 2 + 2;
    expect(weighted).toBeLessThanOrEqual(280);
    expect(url.length).toBeGreaterThan(0);
  });
});

describe('buildShareUrl', () => {
  it('debug などのパラメータを消し、seed だけ付ける', () => {
    expect(buildShareUrl('https://example.github.io/mato/?debug&god#x', 12)).toBe('https://example.github.io/mato/?seed=12');
    expect(buildShareUrl('https://example.github.io/mato/index.html?low')).toBe('https://example.github.io/mato/index.html');
  });
});

describe('投稿用 URL', () => {
  const url = 'https://example.github.io/mato/?seed=12';
  const text = buildShareText(record);

  it('X: 本文・URL・ハッシュタグがエンコードされて入る', () => {
    const u = new URL(xIntentUrl(text, url));
    expect(u.origin).toBe('https://twitter.com');
    expect(u.pathname).toBe('/intent/tweet');
    expect(u.searchParams.get('text')).toBe(text);
    expect(u.searchParams.get('url')).toBe(url);
    expect(u.searchParams.get('hashtags')).toBe(HASHTAG);
  });

  it('LINE: URL と本文', () => {
    const u = new URL(lineShareUrl(text, url));
    expect(u.hostname).toBe('social-plugins.line.me');
    expect(u.searchParams.get('url')).toBe(url);
    expect(u.searchParams.get('text')).toBe(text);
  });

  it('Bluesky: 本文に URL とハッシュタグを含める', () => {
    const u = new URL(blueskyIntentUrl(text, url));
    expect(u.hostname).toBe('bsky.app');
    const body = u.searchParams.get('text')!;
    expect(body).toContain(text);
    expect(body).toContain(url);
    expect(body).toContain(`#${HASHTAG}`);
  });

  it('コピー用の全文', () => {
    const t = fullShareText(text, url);
    expect(t.endsWith(`#${HASHTAG}`)).toBe(true);
    expect(t).toContain(url);
  });
});
