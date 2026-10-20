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
  close = vi.fn(async () => {
    this.state = 'closed';
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
  it('iOS で中断された（interrupted）AudioContext は、次の操作で閉じて作り直す', () => {
    setup();
    const a = new AudioManager(true);
    a.unlock();
    const old = FakeContext.instances[0];
    old.state = 'interrupted';
    a.unlock();
    expect(old.close).toHaveBeenCalled();
    expect(FakeContext.instances).toHaveLength(2);
    expect(FakeContext.instances[1].state).toBe('running');
  });

  it('ページが隠れたら閉じ、戻っただけでは作らず、次の操作で作り直す', () => {
    setup();
    const a = new AudioManager(true);
    a.unlock();
    const old = FakeContext.instances[0];
    a.setPageVisible(false);
    expect(old.close).toHaveBeenCalled();
    a.setPageVisible(true);
    expect(FakeContext.instances).toHaveLength(1);
    a.unlock();
    expect(FakeContext.instances).toHaveLength(2);
  });

  it('作り直した後も効果音を鳴らせる（例外にならない）', () => {
    setup();
    const a = new AudioManager(true);
    a.unlock();
    a.setPageVisible(false);
    a.updateStream(0.016, 1, 0);
    a.hit();
    a.unlock();
    expect(() => {
      a.updateStream(0.016, 1, 0);
      a.hit();
      a.flush();
    }).not.toThrow();
  });

  it('一時停止（suspended）なら作り直さず再開する', () => {
    setup();
    const a = new AudioManager(true);
    a.unlock();
    const ctx = FakeContext.instances[0];
    ctx.state = 'suspended';
    a.unlock();
    expect(ctx.resume).toHaveBeenCalled();
    expect(FakeContext.instances).toHaveLength(1);
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
