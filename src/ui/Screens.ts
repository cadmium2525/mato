import type { BestRecord } from '../game/ScoreManager';

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
          <dt>SEED</dt><dd data-slot="seed"></dd>
        </dl>
        <p class="result-comment"><span>清掃員からの評価</span><strong data-slot="comment"></strong></p>
        <p class="result-best" data-slot="best"></p>
        <button class="btn btn-primary" data-act="retry">リトライ <kbd>Enter</kbd></button>
        <button class="btn" data-act="title">タイトルへ <kbd>T</kbd></button>
      </div>`);
    this.caption = this.make(`<p data-slot="text"></p>`, 'screen-caption');

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
    for (const s of [this.title, this.intro, this.pause, this.result, this.caption]) s.classList.add('hidden');
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
    this.slot(this.result, 'seed').textContent = String(r.seed);
    this.slot(this.result, 'comment').textContent = `「${r.comment}」`;
    this.slot(this.result, 'best').textContent = formatBest(r.best);
    this.result.classList.remove('hidden');
    this.result.querySelector<HTMLButtonElement>('[data-act="retry"]')?.focus();
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
