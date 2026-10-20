import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/audio/AudioManager';

/** Web Audio の最小限のフェイク（ノードは何もしない） */
class FakeParam {
  value = 0;
  setValueAtTime() {}
  setTargetAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  pan = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  connect(n: unknown) {
    return n;
  }
  start() {}
  stop() {}
}
class FakeContext {
  static instances: FakeContext[] = [];
  state: string = 'running';
  sampleRate = 8000;
  currentTime = 0;
  destination = new FakeNode();
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  constructor() {
    FakeContext.instances.push(this);
  }
  createGain() {
    return new FakeNode();
  }
  createBiquadFilter() {
    return new FakeNode();
  }
  createStereoPanner() {
    return new FakeNode();
  }
  createOscillator() {
    return new FakeNode();
  }
  createBufferSource() {
    return new FakeNode();
  }
  createBuffer(_c: number, len: number) {
    return { getChannelData: () => new Float32Array(len) };
  }
}

function setup(isActive = true) {
  FakeContext.instances = [];
  vi.stubGlobal('window', { AudioContext: FakeContext });
  vi.stubGlobal('navigator', { userActivation: { isActive } });
}

afterEach(() => vi.unstubAllGlobals());

describe('AudioManager', () => {
  it('iOS で別アプリから戻ったとき（interrupted）、次の操作で再開する', () => {
    setup();
    const a = new AudioManager(true);
    a.unlock();
    const ctx = FakeContext.instances[0];
    ctx.state = 'interrupted';
    a.unlock();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('ページが隠れたら止め、戻ったら再開を試みる', () => {
    setup();
    const a = new AudioManager(true);
    a.unlock();
    const ctx = FakeContext.instances[0];
    a.setPageVisible(false);
    expect(ctx.suspend).toHaveBeenCalled();
    ctx.state = 'suspended';
    a.setPageVisible(true);
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('閉じられた AudioContext は作り直す', () => {
    setup();
    const a = new AudioManager(true);
    a.unlock();
    FakeContext.instances[0].state = 'closed';
    a.unlock();
    expect(FakeContext.instances).toHaveLength(2);
  });

  it('ユーザー操作の外では AudioContext を作らない（警告を出さない）', () => {
    setup(false);
    new AudioManager(true).unlock();
    expect(FakeContext.instances).toHaveLength(0);
  });

  it('サウンドOFFなら作らない', () => {
    setup();
    new AudioManager(false).unlock();
    expect(FakeContext.instances).toHaveLength(0);
  });
});
