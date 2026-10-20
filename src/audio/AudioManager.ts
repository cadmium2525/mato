/**
 * Web Audio だけで合成する効果音（外部音源なし）。
 * - 尿流: バンドパスしたノイズ（水流）＋ランダムな泡の「ポコ」音。陶器に当たる高めの水音
 * - 効果音: 命中、ニアミス、フラッシュ（クリア）、開始、ゲームオーバー、予告、足音、クリック
 * ブラウザの自動再生制限があるので、最初のユーザー操作で unlock() を呼ぶ。
 * サウンドOFFや AudioContext が使えない環境では何もしない（ゲームは続行できる）。
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private streamGain: GainNode | null = null;
  private streamFilter: BiquadFilterNode | null = null;
  private streamPan: StereoPannerNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled: boolean;
  private streamLevel = 0;
  private bubbleTimer = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(enabled ? 0.7 : 0, this.ctx.currentTime, 0.02);
    if (enabled) this.unlock();
  }

  /** ユーザー操作の中で呼ぶ（iOS Safari などの自動再生制限対策） */
  unlock(): void {
    if (!this.enabled) return;
    // ユーザー操作の最中でなければ作らない（コンソール警告を出さない）
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (activation && !activation.isActive) return;
    try {
      // iOS Safari は別アプリへ移ると state が 'interrupted' になる（'suspended' だけ見ていると戻せない）。
      // 閉じられていたら作り直す
      if (this.ctx && (this.ctx.state as string) === 'closed') this.ctx = null;
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  /** ページが隠れた／戻ったとき（visibilitychange）。隠れている間は止め、戻ったら再開を試みる */
  setPageVisible(visible: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (!visible) {
        if (ctx.state === 'running') void ctx.suspend().catch(() => undefined);
      } else if (this.enabled && ctx.state !== 'running') {
        // ユーザー操作なしでは再開できない環境もある。その場合は次のタップ（unlock）で再開する
        void ctx.resume().catch(() => undefined);
      }
    } catch {
      // 何もしない（音が出ないだけでゲームは続行）
    }
  }

  private init(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.7 : 0;
    this.master.connect(ctx.destination);

    // 1秒のホワイトノイズを使い回す
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // 尿流の常駐ボイス
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.streamFilter = ctx.createBiquadFilter();
    this.streamFilter.type = 'bandpass';
    this.streamFilter.frequency.value = 1800;
    this.streamFilter.Q.value = 0.9;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    this.streamGain = ctx.createGain();
    this.streamGain.gain.value = 0;
    this.streamPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(hp).connect(this.streamFilter).connect(this.streamGain);
    if (this.streamPan) this.streamGain.connect(this.streamPan).connect(this.master);
    else this.streamGain.connect(this.master);
    src.start();
  }

  private get ready(): boolean {
    return this.enabled && !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * 毎フレーム呼ぶ。lanes: 出ている尿流の本数（0で無音）、pan: -1〜1（照準の左右）
   */
  updateStream(dt: number, lanes: number, pan: number): void {
    if (!this.ctx || !this.streamGain || !this.streamFilter) return;
    const target = lanes > 0 && this.enabled ? Math.min(0.32, 0.17 + lanes * 0.05) : 0;
    this.streamLevel += (target - this.streamLevel) * Math.min(1, dt * 18);
    const t = this.ctx.currentTime;
    // 水流のゆらぎ
    const wobble = 1 + 0.25 * Math.sin(t * 13) * Math.sin(t * 3.1);
    this.streamGain.gain.setTargetAtTime(this.streamLevel * wobble, t, 0.03);
    this.streamFilter.frequency.setTargetAtTime(1500 + 700 * Math.sin(t * 2.3) + lanes * 150, t, 0.05);
    this.streamPan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)) * 0.6, t, 0.05);
    // 泡のポコポコ
    if (lanes > 0 && this.ready) {
      this.bubbleTimer -= dt;
      while (this.bubbleTimer <= 0) {
        this.bubbleTimer += 0.02 + Math.random() * 0.06;
        this.bubble(pan);
      }
    }
  }

  private bubble(pan: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + Math.random() * 0.02;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = 700 + Math.random() * 1300;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * (1.6 + Math.random()), t + 0.04);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025 + Math.random() * 0.03, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g);
    this.toMaster(g, pan);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  private toMaster(node: AudioNode, pan = 0): void {
    const ctx = this.ctx!;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p).connect(this.master!);
    } else node.connect(this.master!);
  }

  private noiseBurst(duration: number, filterType: BiquadFilterType, from: number, to: number, gain: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, duration * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g);
    this.toMaster(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.05);
  }

  private tone(freq: number, duration: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    this.toMaster(g);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  /** 命中: べちゃっ＋間の抜けたチャイム */
  hit(): void {
    if (!this.ready) return;
    this.noiseBurst(0.35, 'lowpass', 2500, 300, 0.5);
    this.tone(180, 0.25, 'sine', 0.35, 0, 70);
    this.tone(660, 0.5, 'triangle', 0.12, 0.18, 330);
  }

  nearMiss(): void {
    if (!this.ready) return;
    this.noiseBurst(0.18, 'highpass', 1500, 6000, 0.12);
  }

  /** ラウンドクリア: 水洗の「ジャーッ」＋上昇チャイム */
  flush(): void {
    if (!this.ready) return;
    this.noiseBurst(1.3, 'lowpass', 4000, 400, 0.22);
    this.tone(784, 0.18, 'triangle', 0.12, 0.05);
    this.tone(1046, 0.3, 'triangle', 0.12, 0.17);
  }

  start(): void {
    if (!this.ready) return;
    this.tone(880, 0.12, 'square', 0.06);
  }

  gameOver(): void {
    if (!this.ready) return;
    [523, 415, 330].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.13, i * 0.2));
  }

  /** ショットガン・跳ね返りの予告 */
  warn(): void {
    if (!this.ready) return;
    this.tone(1400, 0.06, 'square', 0.03);
  }

  /** 散弾・跳ね返りの着弾 */
  plip(): void {
    if (!this.ready) return;
    this.tone(1200 + Math.random() * 800, 0.06, 'sine', 0.05, 0, 500);
  }

  step(): void {
    if (!this.ready) return;
    this.noiseBurst(0.06, 'lowpass', 900, 200, 0.12);
  }

  click(): void {
    if (!this.ready) return;
    this.tone(1200, 0.04, 'square', 0.04);
  }
}
