import { ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { AttackDirector } from '../attacks/AttackDirector';
import { getProfile } from '../entities/EnemyProfiles';
import { InputManager, type ActionName } from '../input/InputManager';
import { CameraDirector } from '../scene/CameraDirector';
import { QueueView } from '../scene/QueueView';
import { RestroomScene } from '../scene/RestroomScene';
import { StreamVFX } from '../scene/StreamVFX';
import { AimRing, TargetMarker } from '../scene/SurfaceMarkers';
import { HUD } from '../ui/HUD';
import { Screens, cleanerComment } from '../ui/Screens';
import { DifficultyDirector } from './DifficultyDirector';
import { GameConfig } from './GameConfig';
import { INTRO_TEXT, type Phase } from './GameState';
import { RoundDirector } from './RoundDirector';
import { RoundSimulation } from './RoundSimulation';
import { BestStore, ScoreManager } from './ScoreManager';
import { SeededRandom, randomSeed } from './SeededRandom';

export interface GameOptions {
  /** 固定シード（URL ?seed=）。null なら毎回ランダム */
  seed: number | null;
  lowQuality: boolean;
  debug: boolean;
  /** デバッグ用（?debug&god）: 被弾を無視する。E2E確認用 */
  god: boolean;
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
  private readonly director: RoundDirector;
  private readonly score = new ScoreManager();
  private readonly best = new BestStore();
  private readonly difficulty = new DifficultyDirector();
  private readonly sim: RoundSimulation;
  /** HIT 中のスロー演出用の表示時刻 */
  private visualTime = 0;
  private accumulator = 0;
  private lastFrame = -1;
  private closeupStarted = false;
  private rng = new SeededRandom(1);
  private readonly onResize = (): void => this.resize();

  constructor(private readonly container: HTMLElement, private readonly options: GameOptions) {
    this.renderer = new WebGLRenderer({ antialias: !options.lowQuality, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.lowQuality ? 1 : GameConfig.render.maxPixelRatio));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = !options.lowQuality;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(45, 1, 0.03, 40);
    this.cameraDirector = new CameraDirector(this.camera);
    this.world = new RestroomScene(this.renderer, options.lowQuality);
    const surface = this.world.surface;

    this.sim = new RoundSimulation(surface);
    this.marker = new TargetMarker(surface, this.sim.player.visualRadius);
    this.aimRing = new AimRing(surface, 0.026);
    const o = GameConfig.attack.origin;
    this.vfx = new StreamVFX(surface, new Vector3(o.x, o.y, o.z), GameConfig.attack.arcHeight);
    this.queueView = new QueueView(GameConfig.queue.visibleSlots);
    this.world.scene.add(this.marker.mesh, this.aimRing.mesh, this.vfx.drops, this.vfx.splashes, this.queueView.group);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    container.appendChild(overlay);
    this.hud = new HUD(overlay);
    this.screens = new Screens(overlay, {
      onStart: () => this.startGame(),
      onRetry: () => this.startGame(),
      onTitle: () => this.director.toTitle(),
      onResume: () => this.director.resume(),
    });

    this.director = new RoundDirector(GameConfig.timing, GameConfig.queue.minUpcoming, {
      onPhaseChange: (phase, prev) => this.onPhaseChange(phase, prev),
    });

    this.input = new InputManager();
    this.input.onAction((a) => this.onAction(a));
    this.input.onFocusLost(() => this.director.pause());
    window.addEventListener('resize', this.onResize);
    this.resize();

    this.placeMarker();
    this.onPhaseChange('TITLE', 'TITLE');

    if (options.debug) {
      (window as unknown as Record<string, unknown>).__MATO__ = {
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
          seed: this.director.seed,
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
    window.removeEventListener('resize', this.onResize);
    this.world.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- flow

  private startGame(): void {
    const seed = this.options.seed ?? randomSeed();
    this.rng = new SeededRandom(seed);
    this.score.reset();
    this.queueView.clear();
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
        this.cameraDirector.moveTo('queue', Math.min(1.1, this.director.queuePanSeconds * 0.55));
        break;
      }
      case 'ROUND_READY':
        this.beginRound();
        break;
      case 'PLAYING':
        if (!this.cameraDirector.isSettled) this.cameraDirector.cut('closeup');
        this.queueView.setCurrentVisible(false);
        this.hud.flash('START', 0.6, 'info');
        break;
      case 'ROUND_CLEAR':
        this.hud.flash(`${this.director.cleared}人抜き！`, GameConfig.timing.roundClear, 'good');
        this.sim.impacts = [];
        this.sim.enemy = null;
        this.queueView.releaseCurrent();
        // 補間すると人物の体を通り抜けるのでカットで引く
        this.cameraDirector.cut('approach');
        break;
      case 'HIT':
        this.hud.flash('命中……', GameConfig.timing.hitSlowmo + 0.3, 'bad');
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
        break;
      }
      case 'PAUSED':
        this.screens.showPause(true);
        break;
    }
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
    const usable = diff.attacks.filter((k) => AttackDirector.supportedKinds.includes(k));
    const attackKind = usable.length > 0 ? this.rng.pick(usable) : 'single';
    this.sim.begin(profile, attackKind, diff.trackingMultiplier, this.rng.fork(entry.serial));
    this.aimRing.setRadius(profile.impactRadius);
    this.hud.flash(`${this.director.enemyNumber}人目　${profile.name}`, GameConfig.timing.roundReady, 'info');
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
      this.vfx.update(this.sim.impacts, this.visualTime);
    }
    this.updateHud(dt);
    this.renderer.render(this.world.scene, this.camera);
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
    const r = this.sim.step(step, this.input.getMoveVector());
    this.visualTime = this.sim.time;
    if (r.hit && !this.options.god) {
      const uv = this.sim.player.uv;
      this.marker.hitFlash();
      this.vfx.burst(uv.u, uv.v, r.hit.radius, this.sim.time);
      this.director.registerHit();
      return;
    }
    this.score.addSurvival(step);
    for (let i = 0; i < r.nearMisses; i++) {
      this.score.addNearMiss(this.sim.time);
      this.hud.flash('ニアミス！', 0.5, 'good');
    }
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
      this.aimRing.update(dt, 0, 0, 'off');
      return;
    }
    const { u, v } = this.world.surface.fromMetric(enemy.aim.x, enemy.aim.y);
    const mode = enemy.state === 'windup' || enemy.state === 'warning' ? 'warn' : enemy.state === 'paused' ? 'off' : 'live';
    this.aimRing.update(dt, u, v, mode);
  }

  private updateHud(dt: number): void {
    const enemy = this.sim.enemy;
    const current = this.director.current;
    this.hud.update(
      {
        cleared: this.director.cleared,
        enemyNumber: this.director.enemyNumber,
        enemyName: current ? getProfile(current.kind).name : '',
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
    const minHFov = (44 * Math.PI) / 180;
    const vFovForH = (2 * Math.atan(Math.tan(minHFov / 2) / aspect) * 180) / Math.PI;
    this.camera.fov = Math.max(45, vFovForH);
    this.camera.updateProjectionMatrix();
  }
}
