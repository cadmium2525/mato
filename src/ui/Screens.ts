import type { BestRecord } from '../game/ScoreManager';
import type { Quality, Settings } from '../game/Settings';

export type ShareTarget = 'x' | 'line' | 'bluesky' | 'native' | 'copy' | 'image';
export type SettingKey = 'sound' | 'quality' | 'cinematics';

const QUALITY_LABEL: Record<Quality, string> = { high: '高', medium: '中', low: '低' };

export interface ResultData {
  cleared: number;
  score: number;
  nearMisses: number;
  survivalTime: number;
  seed: number;
  isNewBest: boolean;
  best: BestRecord;
  comment: string;
}

export interface ScreenHandlers {
  onStart: () => void;
  onRetry: () => void;
  onTitle: () => void;
  onResume: () => void;
  onShare: (target: ShareTarget) => void;
  onSetting: (key: SettingKey) => void;
}

function formatBest(best: BestRecord | null): string {
  if (!best) return '自己ベスト：まだ記録がありません';
  return `自己ベスト：${best.cleared}人抜き（スコア ${best.score.toLocaleString('ja-JP')}）`;
}

/** タイトル・導入・ポーズ・リザルトの全画面表示 */
export class Screens {
  private readonly title: HTMLDivElement;
  private readonly intro: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly result: HTMLDivElement;
  private readonly caption: HTMLDivElement;
  private readonly tutorial: HTMLDivElement;

  constructor(private readonly parent: HTMLElement, handlers: ScreenHandlers) {
    this.title = this.make(`
      <div class="sign">
        <div class="sign-pict" aria-hidden="true"><span class="pict-man"></span><span class="pict-target"></span></div>
        <h1 class="title-logo">的、逃走中。</h1>
        <p class="title-sub">TARGET ESCAPE</p>
        <p class="title-lead">あなたは小便器の「的」。<br />襲いかかる小便を、何人分かわし続けられるか。</p>
        <button class="btn btn-primary" data-act="start">スタート <kbd>Enter</kbd></button>
        <dl class="controls">
          <dt>移動</dt><dd><span class="keys-only">WASD / 矢印キー</span><span class="touch-only">画面をドラッグ</span></dd>
          <dt>ポーズ</dt><dd><span class="keys-only">Esc</span><span class="touch-only">画面の Ⅱ ボタン</span></dd>
          <dt>演出スキップ</dt><dd><span class="keys-only">Enter / Space</span><span class="touch-only">画面をタップ</span></dd>
        </dl>
        <p class="title-best" data-slot="best"></p>
        <div class="settings" role="group" aria-label="設定">
          <button class="chip-btn" data-set="sound" data-slot="set-sound"></button>
          <button class="chip-btn" data-set="quality" data-slot="set-quality"></button>
          <button class="chip-btn" data-set="cinematics" data-slot="set-cinematics"></button>
        </div>
      </div>`);
    this.intro = this.make(`<p class="intro-text" data-slot="text"></p><p class="intro-skip">Enter / タップでスキップ</p>`, 'screen-intro');
    this.pause = this.make(`
      <div class="sign sign-small">
        <h2>一時停止中</h2>
        <button class="btn btn-primary" data-act="resume">再開 <kbd>Esc</kbd></button>
        <button class="btn" data-act="title">タイトルへ <kbd>T</kbd></button>
      </div>`);
    this.result = this.make(`
      <div class="sign">
        <p class="result-head">GAME OVER</p>
        <p class="result-count" data-slot="count"></p>
        <p class="result-new hidden" data-slot="new">ベスト更新！</p>
        <dl class="result-stats">
          <dt>スコア</dt><dd data-slot="score"></dd>
          <dt>ニアミス</dt><dd data-slot="near"></dd>
          <dt>生存時間</dt><dd data-slot="time"></dd>
        </dl>
        <p class="result-comment"><span>清掃員からの評価</span><strong data-slot="comment"></strong></p>
        <p class="result-best" data-slot="best"></p>
        <button class="btn btn-primary" data-act="retry">リトライ <kbd>Enter</kbd></button>
        <div class="share">
          <p class="share-title">記録をシェア</p>
          <div class="share-row">
            <button class="share-btn share-x" data-share="x" aria-label="Xでポスト">𝕏 ポスト</button>
            <button class="share-btn share-line" data-share="line">LINE</button>
            <button class="share-btn share-bsky" data-share="bluesky">Bluesky</button>
            <button class="share-btn share-native hidden" data-share="native" data-slot="native">共有…</button>
          </div>
          <div class="share-row">
            <button class="share-btn share-sub" data-share="copy">文面をコピー</button>
            <button class="share-btn share-sub" data-share="image">画像を保存</button>
          </div>
          <p class="share-status" data-slot="share-status" aria-live="polite"></p>
        </div>
        <button class="btn" data-act="title">タイトルへ <kbd>T</kbd></button>
      </div>`);
    this.caption = this.make(`<p data-slot="text"></p>`, 'screen-caption');
    this.tutorial = this.make(
      `<div class="tutorial-card">
        <b>見かた</b>
        <span class="tut-ring tut-aim"></span>黄色い輪＝相手の照準。少し遅れてそこに着弾します<br />
        <span class="tut-ring tut-warn"></span>オレンジの輪＝着弾予告。縮みきったら着弾
      </div>`,
      'screen-tutorial',
    );

    const bind = (root: HTMLElement): void => {
      root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => {
        b.addEventListener('click', () => {
          const act = b.dataset.act;
          if (act === 'start') handlers.onStart();
          else if (act === 'retry') handlers.onRetry();
          else if (act === 'title') handlers.onTitle();
          else if (act === 'resume') handlers.onResume();
        });
      });
    };
    [this.title, this.pause, this.result].forEach(bind);
    this.result.querySelectorAll<HTMLButtonElement>('[data-share]').forEach((b) => {
      b.addEventListener('click', () => handlers.onShare(b.dataset.share as ShareTarget));
    });
    this.title.querySelectorAll<HTMLButtonElement>('[data-set]').forEach((b) => {
      b.addEventListener('click', () => handlers.onSetting(b.dataset.set as SettingKey));
    });
  }

  private make(html: string, extra = ''): HTMLDivElement {
    const d = document.createElement('div');
    d.className = `screen hidden ${extra}`.trim();
    d.innerHTML = html;
    this.parent.appendChild(d);
    return d;
  }

  private slot(root: HTMLElement, name: string): HTMLElement {
    const e = root.querySelector<HTMLElement>(`[data-slot="${name}"]`);
    if (!e) throw new Error(`missing slot ${name}`);
    return e;
  }

  hideAll(): void {
    // 非表示にしたボタンにフォーカスが残ると、次の Enter で押されてしまう（演出スキップのつもりが再スタート）
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.parent.contains(active)) active.blur();
    for (const s of [this.title, this.intro, this.pause, this.result, this.caption, this.tutorial]) s.classList.add('hidden');
  }

  showTitle(best: BestRecord | null): void {
    this.hideAll();
    this.slot(this.title, 'best').textContent = formatBest(best);
    this.title.classList.remove('hidden');
    this.title.querySelector<HTMLButtonElement>('[data-act="start"]')?.focus();
  }

  showIntro(text: string): void {
    this.hideAll();
    const t = this.slot(this.intro, 'text');
    t.textContent = text;
    t.classList.remove('fade-in');
    void t.offsetWidth;
    t.classList.add('fade-in');
    this.intro.classList.remove('hidden');
  }

  showCaption(text: string): void {
    this.hideAll();
    this.slot(this.caption, 'text').textContent = text;
    this.caption.classList.remove('hidden');
  }

  showPause(visible: boolean): void {
    this.pause.classList.toggle('hidden', !visible);
    if (visible) this.pause.querySelector<HTMLButtonElement>('[data-act="resume"]')?.focus();
  }

  showResult(r: ResultData): void {
    this.hideAll();
    this.slot(this.result, 'count').textContent = `${r.cleared}人抜き！`;
    this.slot(this.result, 'new').classList.toggle('hidden', !r.isNewBest);
    this.slot(this.result, 'score').textContent = r.score.toLocaleString('ja-JP');
    this.slot(this.result, 'near').textContent = `${r.nearMisses} 回`;
    this.slot(this.result, 'time').textContent = `${r.survivalTime.toFixed(1)} 秒`;
    this.slot(this.result, 'comment').textContent = `「${r.comment}」`;
    this.slot(this.result, 'best').textContent = formatBest(r.best);
    this.setShareStatus('');
    this.result.classList.remove('hidden');
    this.result.querySelector<HTMLButtonElement>('[data-act="retry"]')?.focus();
  }

  /** タイトルの設定ボタンの表示を更新 */
  renderSettings(s: Settings): void {
    this.slot(this.title, 'set-sound').textContent = `サウンド：${s.sound ? 'ON' : 'OFF'}`;
    this.slot(this.title, 'set-quality').textContent = `画質：${QUALITY_LABEL[s.quality]}`;
    this.slot(this.title, 'set-cinematics').textContent = `演出：${s.shortCinematics ? '短縮' : '通常'}`;
  }

  showTutorial(visible: boolean): void {
    this.tutorial.classList.toggle('hidden', !visible);
  }

  setNativeShareAvailable(available: boolean): void {
    this.slot(this.result, 'native').classList.toggle('hidden', !available);
  }

  setShareStatus(text: string): void {
    this.slot(this.result, 'share-status').textContent = text;
  }

  showError(message: string): void {
    this.hideAll();
    const d = this.make(`<div class="sign sign-small"><h2>起動できません</h2><p></p></div>`);
    const p = d.querySelector('p');
    if (p) p.textContent = message;
    d.classList.remove('hidden');
  }
}

export function cleanerComment(cleared: number): string {
  if (cleared <= 0) return '……まあ、的ですからね。';
  if (cleared <= 2) return '掃除はしやすかったです。';
  if (cleared <= 5) return 'なかなか逃げ足が速い。';
  if (cleared <= 9) return '床が大変なことになってます。';
  if (cleared <= 19) return 'こんな的、見たことがない。';
  return '伝説の的。清掃員一同、困惑しています。';
}
