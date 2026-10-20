import { ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { ATTACK_NAMES, type AttackKind } from '../attacks/AttackTypes';
import { AudioManager } from '../audio/AudioManager';
import { getProfile } from '../entities/EnemyProfiles';
import { InputManager, type ActionName } from '../input/InputManager';
import { TouchJoystick } from '../input/TouchJoystick';
import { CameraDirector } from '../scene/CameraDirector';
import { QueueView } from '../scene/QueueView';
import { RestroomScene } from '../scene/RestroomScene';
import { StainLayer } from '../scene/StainLayer';
import { StreamVFX, VFX_QUALITY } from '../scene/StreamVFX';
import { AimRing, TargetMarker } from '../scene/SurfaceMarkers';
import { HUD } from '../ui/HUD';
import {
  blueskyIntentUrl,
  buildShareText,
  buildShareUrl,
  canNativeShare,
  copyText,
  downloadBlob,
  fullShareText,
  lineShareUrl,
  nativeShare,
  openIntent,
  xIntentUrl,
  type ShareRecord,
} from '../share/Share';
import { canvasToBlob, drawShareCard } from '../share/ShareCard';
import { Screens, cleanerComment, type SettingKey, type ShareTarget } from '../ui/Screens';
import { DifficultyDirector } from './DifficultyDirector';
import { GameConfig } from './GameConfig';
import { INTRO_TEXT, type Phase } from './GameState';
import { RoundDirector } from './RoundDirector';
import { RoundSimulation } from './RoundSimulation';
import { BestStore, ScoreManager } from './ScoreManager';
import { SeededRandom, randomSeed } from './SeededRandom';
import { SettingsStore, defaultSettings, type Quality, type Settings } from './Settings';

export interface GameOptions {
  /** 固定シード（URL ?seed=）。null なら毎回ランダム */
  seed: number | null;
  lowQuality: boolean;
  /** タッチ主体の端末（スマホ・タブレット） */
  touch: boolean;
  debug: boolean;
  /** デバッグ用（?debug&god）: 被弾を無視する。E2E確認用 */
  god: boolean;
  /** デバッグ用（?debug&attack=shotgun）: 攻撃の種類を固定する */
  forceAttack: AttackKind | null;
}

/** 描画・入力・ロジックを束ねるオーケストレーター */
export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly camera: PerspectiveCamera;
  private readonly world: RestroomScene;
  private readonly cameraDirector: CameraDirector;
  private readonly marker: TargetMarker;
  private readonly aimRing: AimRing;
  private readonly vfx: StreamVFX;
  private readonly queueView: QueueView;
  private readonly hud: HUD;
  private readonly screens: Screens;
  private readonly input: InputManager;
  private readonly joystick: TouchJoystick;
  private readonly director: RoundDirector;
  private readonly score = new ScoreManager();
  private readonly best = new BestStore();
  private readonly difficulty = new DifficultyDirector();
  private readonly sim: RoundSimulation;
  private readonly stains: StainLayer;
  private readonly audio: AudioManager;
  private readonly settingsStore = new SettingsStore();
  private settings: Settings;
  /** 直近のゲームオーバーの記録（共有用）と、その瞬間の画面 */
  private lastRecord: ShareRecord | null = null;
  private snapshot: HTMLCanvasElement | null = null;
  private snapshotPending = false;
  private tutorialVisible = false;
  /** HIT 中のスロー演出用の表示時刻 */
  private visualTime = 0;
  private accumulator = 0;
  private lastFrame = -1;
  private closeupStarted = false;
  private rng = new SeededRandom(1);
  /** このゲームで既に出た攻撃（解禁直後の攻撃を必ず1回体験させるため） */
  private readonly usedAttacks = new Set<AttackKind>();
  private attackKind: AttackKind = 'single';
  private readonly onResize = (): void => this.resize();

  constructor(private readonly container: HTMLElement, private readonly options: GameOptions) {
    this.settings = this.settingsStore.load(defaultSettings(options.touch));
    // ?low はこのセッションだけ低画質にする（保存はしない）
    if (options.lowQuality) this.settings = { ...this.settings, quality: 'low' };
    this.renderer = new WebGLRenderer({ antialias: this.settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = GameConfig.quality[this.settings.quality].shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(45, 1, 0.03, 40);
    this.cameraDirector = new CameraDirector(this.camera);
    this.world = new RestroomScene(this.renderer, !GameConfig.quality[this.settings.quality].shadows);
    const surface = this.world.surface;

    this.sim = new RoundSimulation(surface);
    this.marker = new TargetMarker(surface, this.sim.player.visualRadius);
    this.aimRing = new AimRing(surface, 0.026);
    const o = GameConfig.attack.origin;
    this.vfx = new StreamVFX(surface, new Vector3(o.x, o.y, o.z), GameConfig.attack.arcHeight, GameConfig.attack.emitInterval);
    this.stains = new StainLayer(this.world.stainGeometry, surface, this.world.innerBounds, GameConfig.quality[this.settings.quality].stainSize);
    this.queueView = new QueueView(GameConfig.queue.visibleSlots);
    this.world.scene.add(this.stains.mesh, this.marker.mesh, this.aimRing.group, this.vfx.group, this.queueView.group);
    this.audio = new AudioManager(this.settings.sound);

    // キャンバスの上に仮想スティックの受付面、その上に HUD / 画面を重ねる
    this.joystick = new TouchJoystick(container, GameConfig.touch);
    this.joystick.onTap(() => {
      const phase = this.director.phase;
      if (phase === 'INTRO' || phase === 'QUEUE_PAN') this.director.skip();
    });
    container.classList.toggle('is-touch', options.touch);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    container.appendChild(overlay);
    this.hud = new HUD(
      overlay,
      () => this.director.pause(),
      () => this.toggleSound(),
    );
    this.screens = new Screens(overlay, {
      onStart: () => this.startGame(),
      onRetry: () => this.startGame(),
      onTitle: () => this.director.toTitle(),
      onResume: () => this.director.resume(),
      onShare: (t) => void this.share(t),
      onSetting: (k) => this.changeSetting(k),
    });
    this.screens.setNativeShareAvailable(canNativeShare());

    this.director = new RoundDirector(GameConfig.timing, GameConfig.queue.minUpcoming, {
      onPhaseChange: (phase, prev) => this.onPhaseChange(phase, prev),
    });
    this.applySettings();
    // 自動再生制限: 最初の操作で音を有効にする
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);

    this.input = new InputManager();
    this.input.onAction((a) => this.onAction(a));
    this.input.onFocusLost(() => {
      this.joystick.release();
      this.director.pause();
    });
    window.addEventListener('resize', this.onResize);
    this.resize();

    this.placeMarker();
    this.onPhaseChange('TITLE', 'TITLE');

    if (options.debug) {
      (window as unknown as Record<string, unknown>).__MATO__ = {
        /** デバッグ: カメラを任意の位置へ（見た目の確認用） */
        showCurrent: () => this.queueView.setCurrentVisible(true),
        camera: (pos: [number, number, number], target: [number, number, number]) => {
          this.camera.position.set(...pos);
          this.camera.lookAt(...target);
          this.renderer.render(this.world.scene, this.camera);
        },
        state: () => ({
          phase: this.director.phase,
          phaseTime: this.director.phaseTime,
          cleared: this.director.cleared,
          enemyNumber: this.director.enemyNumber,
          current: this.director.current,
          upcoming: this.director.upcoming(GameConfig.queue.hudPreview),
          score: this.score.score,
          nearMisses: this.score.nearMisses,
          player: { ...this.sim.player.position },
          aim: this.sim.enemy ? { ...this.sim.enemy.aim } : null,
          impacts: this.sim.impacts.length,
          attack: this.attackKind,
          pattern: this.sim.attacks.pattern,
          seed: this.director.seed,
          drawCalls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          geometries: this.renderer.info.memory.geometries,
          textures: this.renderer.info.memory.textures,
        }),
      };
    }
  }

  start(): void {
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.input.dispose();
    this.joystick.dispose();
    window.removeEventListener('resize', this.onResize);
    this.world.dispose();
    this.stains.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- settings

  private applySettings(): void {
    const q = GameConfig.quality[this.settings.quality];
    const touchCap = this.options.touch ? GameConfig.render.maxPixelRatioTouch : GameConfig.render.maxPixelRatio;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio, touchCap));
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      // 影の有無はシェーダーの再コンパイルが必要
      this.world.scene.traverse((o) => {
        const m = (o as { material?: { needsUpdate: boolean } | Array<{ needsUpdate: boolean }> }).material;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
    this.world.setShadows(q.shadows);
    this.vfx.setQuality(VFX_QUALITY[this.settings.quality]);
    this.stains.setResolution(q.stainSize);
    this.audio.setEnabled(this.settings.sound);
    this.hud.setSound(this.settings.sound);
    this.director.setShortCinematics(this.settings.shortCinematics);
    this.screens.renderSettings(this.settings);
    this.resize();
  }

  private saveSettings(): void {
    // ?low で一時的に下げた画質は保存しない
    const toSave = this.options.lowQuality ? { ...this.settings, quality: this.settingsStore.load(this.settings).quality } : this.settings;
    this.settingsStore.save(toSave);
  }

  private changeSetting(key: SettingKey): void {
    const order: Quality[] = ['high', 'medium', 'low'];
    if (key === 'sound') this.settings = { ...this.settings, sound: !this.settings.sound };
    else if (key === 'quality') this.settings = { ...this.settings, quality: order[(order.indexOf(this.settings.quality) + 1) % order.length] };
    else this.settings = { ...this.settings, shortCinematics: !this.settings.shortCinematics };
    this.applySettings();
    this.saveSettings();
    this.audio.unlock();
    this.audio.click();
  }

  private toggleSound(): void {
    this.changeSetting('sound');
  }

  // ---------------------------------------------------------------- share

  private async share(target: ShareTarget): Promise<void> {
    const r = this.lastRecord;
    if (!r) return;
    const url = buildShareUrl(new URL(import.meta.env.BASE_URL, window.location.href).toString(), r.seed);
    const text = buildShareText(r);
    this.audio.click();
    switch (target) {
      case 'x':
        if (!openIntent(xIntentUrl(text, url))) this.screens.setShareStatus('ポップアップがブロックされました');
        break;
      case 'line':
        if (!openIntent(lineShareUrl(text, url))) this.screens.setShareStatus('ポップアップがブロックされました');
        break;
      case 'bluesky':
        if (!openIntent(blueskyIntentUrl(text, url))) this.screens.setShareStatus('ポップアップがブロックされました');
        break;
      case 'copy':
        this.screens.setShareStatus((await copyText(fullShareText(text, url))) ? '文面をコピーしました' : 'コピーできませんでした');
        break;
      case 'native': {
        const blob = await canvasToBlob(drawShareCard(r, this.snapshot, url));
        const res = await nativeShare(text, url, blob);
        if (res === 'failed') this.screens.setShareStatus('共有できませんでした');
        break;
      }
      case 'image': {
        const blob = await canvasToBlob(drawShareCard(r, this.snapshot, url));
        if (blob) {
          downloadBlob(blob, `mato-${r.cleared}nin.png`);
          this.screens.setShareStatus('画像を保存しました');
        } else this.screens.setShareStatus('画像を作れませんでした');
        break;
      }
    }
  }

  /** レンダリング直後に呼ぶ（WebGL のバッファが残っているうちに写す） */
  private captureSnapshot(): void {
    try {
      const src = this.renderer.domElement;
      const c = document.createElement('canvas');
      const scale = Math.min(1, 900 / Math.max(1, src.width));
      c.width = Math.round(src.width * scale);
      c.height = Math.round(src.height * scale);
      c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height);
      this.snapshot = c;
    } catch {
      this.snapshot = null;
    }
  }

  // ---------------------------------------------------------------- flow

  private startGame(): void {
    const seed = this.options.seed ?? randomSeed();
    this.rng = new SeededRandom(seed);
    this.score.reset();
    this.usedAttacks.clear();
    this.queueView.clear();
    // 汚れは1ゲームの間たまり続け、新しいゲームで掃除される
    this.stains.clear();
    this.world.setPuddleLevel(0);
    this.audio.unlock();
    this.audio.click();
    this.director.startGame(seed);
  }

  private onAction(action: ActionName): void {
    const phase = this.director.phase;
    switch (action) {
      case 'confirm':
        if (phase === 'TITLE') this.startGame();
        else if (phase === 'INTRO' || phase === 'QUEUE_PAN') this.director.skip();
        else if (phase === 'GAME_OVER') this.startGame();
        else if (phase === 'PAUSED') this.director.resume();
        break;
      case 'pause':
        if (phase === 'PAUSED') this.director.resume();
        else this.director.pause();
        break;
      case 'retry':
        if (phase === 'GAME_OVER') this.startGame();
        break;
      case 'title':
        if (phase === 'GAME_OVER' || phase === 'PAUSED') this.director.toTitle();
        break;
    }
  }

  private onPhaseChange(phase: Phase, prev: Phase): void {
    // スティックは入場中から握っておけるが、移動はプレイ中のみ反映される
    this.joystick.setEnabled(phase === 'ROUND_READY' || phase === 'PLAYING');
    if (prev === 'PAUSED' && phase !== 'TITLE') {
      this.screens.showPause(false);
      this.lastFrame = -1;
      return;
    }
    const upcoming = (): ReturnType<RoundDirector['upcoming']> => this.director.upcoming(GameConfig.queue.visibleSlots);
    switch (phase) {
      case 'TITLE':
        this.clearRound();
        this.queueView.clear();
        this.hud.show(false);
        this.screens.showTitle(this.best.load());
        this.cameraDirector.moveTo('title', 1.0);
        break;
      case 'INTRO':
        this.hud.show(false);
        this.screens.showIntro(INTRO_TEXT);
        this.queueView.sync(null, upcoming());
        this.cameraDirector.cut('overview');
        this.cameraDirector.moveTo('closeup', GameConfig.timing.intro * 1.6);
        break;
      case 'QUEUE_PAN': {
        this.clearRound();
        this.queueView.sync(null, upcoming());
        const first = this.director.upcoming(1)[0];
        this.screens.showCaption(`順番待ちの列。最初の相手は「${getProfile(first.kind).name}」。`);
        this.hud.show(true);
        const pan = this.director.queuePanSeconds;
        if (pan >= 2) {
          // 列の先頭から最後尾へ流す
          this.cameraDirector.moveTo('queueFront', 0.7, { name: 'queueBack', seconds: pan - 0.9 });
        } else {
          this.cameraDirector.moveTo('queue', Math.min(1.1, pan * 0.55));
        }
        break;
      }
      case 'ROUND_READY':
        this.beginRound();
        break;
      case 'PLAYING':
        if (!this.cameraDirector.isSettled) this.cameraDirector.cut('closeup');
        this.queueView.setCurrentVisible(false);
        this.hud.flash('START', 0.6, 'info');
        this.audio.start();
        break;
      case 'ROUND_CLEAR':
        this.hud.flash(`${this.director.cleared}人抜き！`, this.director.roundClearSeconds, 'good');
        this.audio.flush();
        this.hideTutorial();
        this.sim.impacts = [];
        this.sim.enemy = null;
        this.queueView.releaseCurrent();
        // 補間すると人物の体を通り抜けるのでカットで引く
        this.cameraDirector.cut('approach');
        break;
      case 'HIT':
        this.hud.flash('命中……', GameConfig.timing.hitSlowmo + 0.3, 'bad');
        this.audio.hit();
        this.cameraDirector.shake(0.006, 0.4);
        this.hideTutorial();
        break;
      case 'GAME_OVER': {
        const record = {
          cleared: this.director.cleared,
          score: this.score.score,
          survivalTime: Math.round(this.score.survivalTime * 10) / 10,
          seed: this.director.seed,
        };
        const { isNewBest, best } = this.best.submit(record);
        this.hud.show(false);
        this.queueView.setCurrentVisible(true);
        this.screens.showResult({
          ...record,
          nearMisses: this.score.nearMisses,
          isNewBest,
          best,
          comment: cleanerComment(record.cleared),
        });
        this.cameraDirector.cut('approach');
        // 引きの画では発射口（プレイ用カメラの画面外）が見えてしまうので、尿流は片付ける
        this.sim.impacts = [];
        this.vfx.clear();
        this.lastRecord = { ...record, nearMisses: this.score.nearMisses, comment: cleanerComment(record.cleared), isNewBest };
        this.snapshot = null;
        this.snapshotPending = true;
        this.audio.gameOver();
        break;
      }
      case 'PAUSED':
        this.screens.showPause(true);
        break;
    }
  }

  private hideTutorial(): void {
    if (!this.tutorialVisible) return;
    this.tutorialVisible = false;
    this.screens.showTutorial(false);
    this.settings = { ...this.settings, tutorialSeen: true };
    this.saveSettings();
  }

  /** 古い攻撃・タイマー・エフェクトを破棄する */
  private clearRound(): void {
    this.sim.clear();
    this.vfx.clear();
    this.accumulator = 0;
    this.visualTime = 0;
    this.placeMarker();
  }

  private beginRound(): void {
    const entry = this.director.current;
    if (!entry) return;
    this.clearRound();
    this.screens.hideAll();
    this.hud.show(true);
    this.closeupStarted = false;
    this.queueView.sync(entry, this.director.upcoming(GameConfig.queue.visibleSlots));
    this.cameraDirector.moveTo('approach', 0.5);

    const profile = getProfile(entry.kind);
    const diff = this.difficulty.forEnemy(this.director.enemyNumber);
    const attackKind = this.options.forceAttack ?? this.difficulty.chooseAttack(this.director.enemyNumber, this.rng, this.usedAttacks);
    const isNew = !this.usedAttacks.has(attackKind) && attackKind !== 'single';
    this.usedAttacks.add(attackKind);
    this.attackKind = attackKind;
    this.sim.begin(profile, attackKind, diff, this.rng.fork(entry.serial));
    this.aimRing.setRadius(profile.impactRadius);
    // 初回だけ、照準と予告の見かたを出す
    if (!this.settings.tutorialSeen) {
      this.tutorialVisible = true;
      this.screens.showTutorial(true);
    }
    const label = `${this.director.enemyNumber}人目　${profile.name}`;
    this.hud.flash(isNew ? `${label}\n新攻撃「${ATTACK_NAMES[attackKind]}」` : label, GameConfig.timing.roundReady, isNew ? 'bad' : 'info');
  }

  // ---------------------------------------------------------------- loop

  private frame(time: number): void {
    const raw = this.lastFrame < 0 ? 0 : (time - this.lastFrame) / 1000;
    this.lastFrame = time;
    const dt = Math.min(raw, GameConfig.simulation.maxFrameDelta);
    const phase = this.director.phase;

    if (phase !== 'PAUSED') {
      this.director.update(dt);
      if (this.director.phase === 'ROUND_READY' && !this.closeupStarted && this.director.phaseTime >= GameConfig.timing.roundReadyApproach) {
        this.closeupStarted = true;
        this.queueView.setCurrentVisible(false);
        this.cameraDirector.moveTo('closeup', GameConfig.timing.roundReady - GameConfig.timing.roundReadyApproach - 0.15);
      }
      if (this.director.phase === 'PLAYING') this.simulate(dt);
      else if (this.director.phase === 'HIT') this.visualTime += dt * 0.2; // スロー演出（判定は止める）

      this.cameraDirector.update(dt);
      this.queueView.update(dt);
      this.marker.update(dt);
      this.updateAimRing(dt);
      this.vfx.update(this.sim.impacts, this.visualTime, dt);
      this.onLandings();
      this.stains.update(dt);
      this.updateStreamAudio(dt);
      // 初回ヒントはプレイ開始から数秒で消す
      if (this.tutorialVisible && this.director.phase === 'PLAYING' && this.director.phaseTime > 4) this.hideTutorial();
    } else {
      this.audio.updateStream(dt, 0, 0);
    }
    this.updateHud(dt);
    this.renderer.render(this.world.scene, this.camera);
    if (this.snapshotPending && this.cameraDirector.isSettled) {
      this.snapshotPending = false;
      this.captureSnapshot();
    }
  }

  /** 着弾ごとの演出（汚れ・受け皿・音） */
  private onLandings(): void {
    let plip = false;
    for (const imp of this.vfx.landings) {
      this.stains.add(imp);
      if (imp.kind !== 'stream') plip = true;
    }
    if (plip) this.audio.plip();
    if (this.vfx.landings.length > 0) this.world.setPuddleLevel(this.stains.totalLandings / 5000);
  }

  private updateStreamAudio(dt: number): void {
    const enemy = this.sim.enemy;
    const playing = this.director.phase === 'PLAYING';
    let lanes = 0;
    let pan = 0;
    if (enemy && playing && enemy.state === 'streaming') {
      const pattern = this.sim.attacks.pattern;
      if (pattern === 'single' || pattern === 'twoWay' || pattern === 'threeWay') lanes = this.sim.attacks.offsets(pattern).length;
      pan = (enemy.aim.x / this.world.surface.widthM) * 2 - 1;
    }
    this.audio.updateStream(dt, lanes, pan);
  }

  private simulate(dt: number): void {
    const step = GameConfig.simulation.fixedStep;
    this.accumulator += dt;
    while (this.accumulator >= step && this.director.phase === 'PLAYING') {
      this.accumulator -= step;
      this.stepOnce(step);
    }
    this.placeMarker();
  }

  private stepOnce(step: number): void {
    const r = this.sim.step(step, this.joystick.isActive ? this.joystick.getVector() : this.input.getMoveVector());
    this.visualTime = this.sim.time;
    if (r.hit && !this.options.god) {
      const uv = this.sim.player.uv;
      this.marker.hitFlash();
      this.vfx.burst(uv.u, uv.v, r.hit.radius, this.sim.time);
      this.stains.splash(uv.u, uv.v, r.hit.radius);
      this.director.registerHit();
      return;
    }
    this.score.addSurvival(step);
    for (let i = 0; i < r.nearMisses; i++) {
      this.score.addNearMiss(this.sim.time);
      this.hud.flash('ニアミス！', 0.5, 'good');
      this.audio.nearMiss();
    }
    if (r.warned) this.audio.warn();
    if (r.finished) {
      this.score.roundCleared();
      this.director.completeRound();
    }
  }

  private placeMarker(): void {
    const { u, v } = this.sim.player.uv;
    this.marker.setPosition(u, v);
  }

  private updateAimRing(dt: number): void {
    const enemy = this.sim.enemy;
    const phase = this.director.phase;
    if (!enemy || (phase !== 'PLAYING' && phase !== 'HIT') || enemy.state === 'done') {
      this.aimRing.update(dt, [], 'off');
      return;
    }
    const attacks = this.sim.attacks;
    // 予備動作中は、これから始まる攻撃の形（2WAYなら2つ）を点滅で予告する
    const pattern = enemy.state === 'windup' ? attacks.patternAt(enemy.profile.windupSeconds) : attacks.pattern;
    const surface = this.world.surface;
    // 便器の外に外れる流れは着弾も作られないので、リングも出さない（AttackDirector と同じ範囲）
    const points = attacks
      .offsets(pattern)
      .map((o) => surface.fromMetric(enemy.aim.x + o.x, enemy.aim.y + o.y))
      .filter((p) => p.u >= -0.15 && p.u <= 1.15 && p.v >= -0.1 && p.v <= 1.05);
    const mode =
      enemy.state === 'windup' || enemy.state === 'warning' || pattern === 'gap' ? 'warn' : enemy.state === 'paused' ? 'off' : 'live';
    this.aimRing.update(dt, points, mode);
  }

  private updateHud(dt: number): void {
    const enemy = this.sim.enemy;
    const current = this.director.current;
    this.hud.update(
      {
        cleared: this.director.cleared,
        enemyNumber: this.director.enemyNumber,
        enemyName: current ? getProfile(current.kind).name : '',
        attackName: enemy ? ATTACK_NAMES[this.attackKind] : '',
        remaining: enemy ? enemy.totalSeconds - enemy.elapsed : 0,
        total: enemy ? enemy.totalSeconds : 0,
        score: this.score.score,
        nearMisses: this.score.nearMisses,
        seed: this.director.seed,
        upcoming: this.director.upcoming(GameConfig.queue.hudPreview).map((e) => ({
          serial: e.serial,
          kind: e.kind,
          name: getProfile(e.kind).name,
        })),
      },
      dt,
    );
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 縦長画面でも便器の横幅が収まるよう、必要な水平画角から縦画角を決める
    const minHFov = (38 * Math.PI) / 180;
    const vFovForH = (2 * Math.atan(Math.tan(minHFov / 2) / aspect) * 180) / Math.PI;
    // 横持ちスマホのような低い画面では HUD の分だけ少し引く
    const baseFov = h < 500 ? 52 : 45;
    this.camera.fov = Math.max(baseFov, vFovForH);
    this.camera.updateProjectionMatrix();
  }
}
