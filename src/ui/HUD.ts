import type { EnemyKind } from '../entities/EnemyProfiles';

export interface HudState {
  cleared: number;
  enemyNumber: number;
  enemyName: string;
  attackName: string;
  remaining: number;
  total: number;
  score: number;
  nearMisses: number;
  seed: number;
  upcoming: ReadonlyArray<{ serial: number; kind: EnemyKind; name: string }>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  parent?.appendChild(e);
  return e;
}

/** プレイ中の表示。テキストは変化したときだけ書き換える */
export class HUD {
  readonly root: HTMLDivElement;
  private readonly cleared: HTMLDivElement;
  private readonly enemy: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly remaining: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly near: HTMLDivElement;
  private readonly seed: HTMLDivElement;
  private readonly queue: HTMLOListElement;
  private readonly message: HTMLDivElement;
  private readonly cache = new Map<HTMLElement, string>();
  private queueKey = '';
  private messageTimer = 0;

  private readonly soundBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, onPause: () => void, onToggleSound: () => void) {
    this.root = el('div', 'hud hidden', parent);
    const left = el('div', 'hud-panel hud-left', this.root);
    this.cleared = el('div', 'hud-cleared', left);
    this.enemy = el('div', 'hud-enemy', left);
    const barWrap = el('div', 'hud-bar', left);
    this.bar = el('div', 'hud-bar-fill', barWrap);
    this.remaining = el('div', 'hud-remaining', left);

    const right = el('div', 'hud-panel hud-right', this.root);
    this.score = el('div', 'hud-score', right);
    this.near = el('div', 'hud-near', right);
    this.seed = el('div', 'hud-seed', right);

    const q = el('div', 'hud-panel hud-queue', this.root);
    el('div', 'hud-queue-title', q).textContent = '順番待ち';
    this.queue = el('ol', 'hud-queue-list', q);

    this.message = el('div', 'hud-message hidden', this.root);
    el('div', 'hud-help hud-help-keys', this.root).textContent = 'WASD / 矢印：移動　Esc：ポーズ';
    el('div', 'hud-help hud-help-touch', this.root).textContent = '画面をドラッグして移動';

    const pause = el('button', 'hud-pause', this.root);
    pause.type = 'button';
    pause.setAttribute('aria-label', 'ポーズ');
    pause.textContent = 'Ⅱ';
    pause.addEventListener('click', onPause);

    this.soundBtn = el('button', 'hud-sound', this.root);
    this.soundBtn.type = 'button';
    this.soundBtn.addEventListener('click', onToggleSound);
    this.setSound(true);
  }

  setSound(on: boolean): void {
    this.soundBtn.textContent = on ? '🔊' : '🔇';
    this.soundBtn.setAttribute('aria-label', on ? 'サウンドをOFFにする' : 'サウンドをONにする');
  }

  show(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  private setText(e: HTMLElement, text: string): void {
    if (this.cache.get(e) === text) return;
    this.cache.set(e, text);
    e.textContent = text;
  }

  update(s: HudState, dt: number): void {
    this.setText(this.cleared, `${s.cleared}人抜き`);
    this.setText(this.enemy, s.enemyNumber > 0 ? `${s.enemyNumber}人目：${s.enemyName}${s.attackName ? `［${s.attackName}］` : ''}` : '');
    const ratio = s.total > 0 ? Math.max(0, Math.min(1, s.remaining / s.total)) : 0;
    this.bar.style.transform = `scaleX(${ratio.toFixed(3)})`;
    this.setText(this.remaining, s.total > 0 ? `残り ${Math.max(0, s.remaining).toFixed(1)} 秒` : '');
    this.setText(this.score, `SCORE ${s.score.toLocaleString('ja-JP')}`);
    this.setText(this.near, `ニアミス ${s.nearMisses}`);
    this.setText(this.seed, `SEED ${s.seed}`);

    const key = s.upcoming.map((u) => `${u.serial}:${u.kind}`).join(',');
    if (key !== this.queueKey) {
      this.queueKey = key;
      this.queue.replaceChildren(
        ...s.upcoming.map((u) => {
          const li = document.createElement('li');
          li.className = `chip chip-${u.kind}`;
          li.textContent = `${u.serial}. ${u.name}`;
          return li;
        }),
      );
    }

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message.classList.add('hidden');
    }
  }

  flash(text: string, seconds: number, variant: 'info' | 'good' | 'bad' = 'info'): void {
    this.message.textContent = text;
    this.message.className = `hud-message hud-message-${variant}`;
    // アニメーションを再始動
    void this.message.offsetWidth;
    this.message.classList.add('pop');
    this.messageTimer = seconds;
  }

  hideMessage(): void {
    this.messageTimer = 0;
    this.message.classList.add('hidden');
  }
}
