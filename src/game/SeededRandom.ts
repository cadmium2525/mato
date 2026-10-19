/** mulberry32 ベースのシード付き乱数。行列順・照準の揺れなどの再現に使う。 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /** 別系統の乱数列を派生させる（キュー用・照準用などで干渉させない） */
  fork(salt: number): SeededRandom {
    return new SeededRandom((Math.imul(this.next() * 4294967296, 2654435761) ^ salt) >>> 0);
  }
}

export function randomSeed(): number {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % 1000000;
  } catch {
    return Math.floor(Math.random() * 1000000);
  }
}
