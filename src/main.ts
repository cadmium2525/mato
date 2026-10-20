import './styles.css';
import type { AttackKind } from './attacks/AttackTypes';
import { AttackDirector } from './attacks/AttackDirector';
import { Game } from './game/Game';

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function showFatal(root: HTMLElement, message: string): void {
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fatal';
  const h = document.createElement('h1');
  h.textContent = '的、逃走中。';
  const p = document.createElement('p');
  p.textContent = message;
  box.append(h, p);
  root.appendChild(box);
}

// iOS: 長押しの文字選択・ピンチ拡大のジェスチャーを止める
document.addEventListener('selectstart', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

const root = document.getElementById('app');
if (root) {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  const seed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) : null;
  if (!webglAvailable()) {
    showFatal(root, 'このブラウザでは WebGL が使えないため、ゲームを起動できません。最新の Chrome / Firefox / Safari でお試しください。');
  } else {
    try {
      const touch = params.has('touch') || window.matchMedia?.('(pointer: coarse)').matches === true;
      const debug = params.has('debug');
      const attackParam = params.get('attack') as AttackKind | null;
      const forceAttack = debug && attackParam && AttackDirector.supportedKinds.includes(attackParam) ? attackParam : null;
      const game = new Game(root, { seed, lowQuality: params.has('low'), touch, debug, god: debug && params.has('god'), forceAttack,
        audioDebug: params.has('audiodebug'),
        capture: debug && params.has('capture'),
        autopilot: debug && params.has('autopilot'),
      });
      // 撮影モードでは自動で進めない（__MATO__.advance で1コマずつ）
      if (!(debug && params.has('capture'))) game.start();
    } catch (err) {
      console.error(err);
      showFatal(root, '3D描画の初期化に失敗しました。ハードウェアアクセラレーションが有効か確認してください。');
    }
  }
}
