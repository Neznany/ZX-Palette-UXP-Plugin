function threshold(channel, w, h, t) {
  for (let i = 0; i < w * h; i++) {
    const v = channel[i];
    channel[i] = v > t * 255 ? 255 : 0;
  }
}

// ——— Checkerboard 2x1 Dithering ———
/**
 * Checkerboard 2x1 dithering (чергування пікселів у шаховому порядку 2x1)
 * t ∈ [0,1]: 0 — простий поріг, 1 — повний патерн
 * @param {Uint8Array|Float32Array} channel
 * @param {number} w
 * @param {number} h
 * @param {number} t
 */
function ditherCheckerboard2x1(channel, w, h, t) {
  t *= 0.6; // зменшуємо діапазон t для більш м'якого ефекту
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const vNorm = channel[idx] / 255;
      // checker: 0 для "чорних" клітин, 1 для "білих"
      const checker = (x + y) % 2 === 0 ? 0 : 1;
      // t=0: поріг 0.5, t=1: checker 0 або 1
      const thr = (1 - t) * 0.5 + t * checker;
      channel[idx] = vNorm > thr ? 255 : 0;
    }
  }
}
// 8×8 Bayer pattern (0…63)
const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/**
 * Ordered (Bayer) dithering по-канально.
 * t ∈ [0,1] — сила дізерингу:
 *   0 → рівень порогу 0.5 (жорсткий поріг),
 *   1 → повний Bayer (поріг = матриця/64).
 *
 * @param {Uint8Array} channel — одноканальний буфер (0…255)
 * @param {number} w — ширина
 * @param {number} h — висота
 * @param {number} t — сила дізерингу
 */
function ditherBayer(channel, w, h, t) {
  const N = 8;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const oldV = channel[idx];
      // нормалізуємо в [0…1]
      const vNorm = oldV / 255;
      // обчислюємо зміщений поріг:
      // при t=0 → thr=0.5, при t=1 → thr=BAYER8/64
      const m = BAYER8[y % N][x % N] / (N * N);
      const thr = (1 - t) * 0.5 + t * m;
      channel[idx] = vNorm > thr ? 255 : 0;
    }
  }
}

// ——— Bayer 4x4 ———
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
function ditherBayer4(channel, w, h, t) {
  const N = 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const vNorm = channel[idx] / 255;
      const m = BAYER4[y % N][x % N] / 16;
      const thr = (1 - t) * 0.5 + t * m;
      channel[idx] = vNorm > thr ? 255 : 0;
    }
  }
}

// ——— Bayer 2x2 ———
const BAYER2 = [
  [0, 2],
  [3, 1],
];
function ditherBayer2(channel, w, h, t) {
  const N = 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const vNorm = channel[idx] / 255;
      const m = BAYER2[y % N][x % N] / 4;
      const thr = (1 - t) * 0.5 + t * m;
      channel[idx] = vNorm > thr ? 255 : 0;
    }
  }
}

// ——— Dot Diffusion (Knuth, 1987, 8x8 class mask) ———
const DOT_MASK_8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
];
const DOT_DIFFUSION_NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
];
function ditherDotDiffusionTrue(channel, w, h, t) {
  const N = 8;
  const classMap = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) classMap[y * w + x] = DOT_MASK_8[y % N][x % N];

  // Створюємо float-буфер для накопичення помилки
  const buf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) buf[i] = channel[i];

  if (t <= 0) {
    // t=0: простий поріг 0.5, без дифузії
    for (let i = 0; i < w * h; i++) channel[i] = channel[i] > 127 ? 255 : 0;
    return;
  }
  // t>0: класичний Dot Diffusion
  for (let c = 0; c < 64; c++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (classMap[y * w + x] !== c) continue;
        const idx = y * w + x;
        const vNorm = buf[idx] / 255;
        // t=1: класичний Knuth (c/64), t<1: плавний перехід
        const thr = (1 - t) * 0.5 + t * (c / 64);
        const newV = vNorm > thr ? 1 : 0;
        const err = vNorm - newV;
        buf[idx] = newV * 255;
        // Розсіюємо помилку тільки на сусідів з більшим класом
        let nCount = 0;
        const nIdxs = [];
        for (const [dx, dy] of DOT_DIFFUSION_NEIGHBORS) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nidx = ny * w + nx;
          if (classMap[nidx] > c) {
            nCount++;
            nIdxs.push(nidx);
          }
        }
        if (nCount > 0) {
          const errPortion = (err * 255) / nCount;
          for (const nidx of nIdxs) {
            buf[nidx] += errPortion;
          }
        }
      }
    }
  }
  // Копіюємо результат у вихідний канал
  for (let i = 0; i < w * h; i++) channel[i] = buf[i] > 127 ? 255 : 0;
}

// ——— Floyd–Steinberg (FS) ———
function ditherFS(channel, w, h, t) {
  const err = Array(h)
    .fill()
    .map(() => new Float32Array(w));
  for (let y = 0; y < h; y++) {
    const l2r = y % 2 === 0;
    const xStart = l2r ? 0 : w - 1;
    const xEnd = l2r ? w : -1;
    const step = l2r ? 1 : -1;
    for (let x = xStart; x !== xEnd; x += step) {
      const i = y * w + x;
      const oldV = channel[i] + err[y][x];
      const newV = oldV > 127 ? 255 : 0;
      const qe = oldV - newV;
      channel[i] = newV;
      const w7 = (7 / 16) * t;
      const w3 = (3 / 16) * t;
      const w5 = (5 / 16) * t;
      const w1 = (1 / 16) * t;
      if (l2r) {
        if (x + 1 < w) err[y][x + 1] += qe * w7;
        if (y + 1 < h) {
          if (x > 0) err[y + 1][x - 1] += qe * w3;
          err[y + 1][x] += qe * w5;
          if (x + 1 < w) err[y + 1][x + 1] += qe * w1;
        }
      } else {
        if (x > 0) err[y][x - 1] += qe * w7;
        if (y + 1 < h) {
          if (x + 1 < w) err[y + 1][x + 1] += qe * w3;
          err[y + 1][x] += qe * w5;
          if (x > 0) err[y + 1][x - 1] += qe * w1;
        }
      }
    }
  }
}

// —————————————— Atkinson Dithering ——————————————
/**
 * Atkinson dithering по-канально, t ∈ [0,1] – сила дифузії.
 * 6 сусідів з вагою 1/8, масштабуємо їх на t.
 */
function ditherAtkinson(channel, w, h, t) {
  t *= 1.5;
  // буфер помилок
  const err = Array(h)
    .fill()
    .map(() => new Float32Array(w));

  for (let y = 0; y < h; y++) {
    const l2r = y % 2 === 0;
    const xStart = l2r ? 0 : w - 1;
    const xEnd = l2r ? w : -1;
    const step = l2r ? 1 : -1;

    for (let x = xStart; x !== xEnd; x += step) {
      const idx = y * w + x;
      const oldV = channel[idx] + err[y][x];
      const newV = oldV > 127 ? 255 : 0;
      const qe = oldV - newV;
      channel[idx] = newV;

      // Atkinson: 6 сусідів, кожен з базовою вагою 1/8
      const wA = (1 / 8) * t;

      // право
      if (x + 1 < w) err[y][x + 1] += qe * wA;
      // два вправо
      if (x + 2 < w) err[y][x + 2] += qe * wA;
      // наступний ряд
      if (y + 1 < h) {
        if (x - 1 >= 0) err[y + 1][x - 1] += qe * wA;
        err[y + 1][x] += qe * wA;
        if (x + 1 < w) err[y + 1][x + 1] += qe * wA;
      }
      // через два рядки вниз
      if (y + 2 < h) err[y + 2][x] += qe * wA;
    }
  }
}

// Простий PRNG з можливістю сідити
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Фіксований сід (наприклад 12345, можна винести в налаштування)
const BLUE_NOISE_SEED = 12345;

/**
 * Blue-noise (seeded) dithering по-канально.
 * t ∈ [0,1] — сила дізерингу; pattern стабільний між викликами.
 */
function ditherBlueNoise(channel, w, h, t) {
  t /= 2;
  // якщо t == 0 — просто поріг
  if (t <= 0) {
    for (let i = 0, size = w * h; i < size; i++) {
      channel[i] = channel[i] > 127 ? 255 : 0;
    }
    return;
  }

  // інакше — створюємо PRNG з фіксованим seed
  const rng = mulberry32(BLUE_NOISE_SEED);

  for (let i = 0, size = w * h; i < size; i++) {
    const vNorm = channel[i] / 255; // [0…1]
    const noise = (rng() * 2 - 1) * t; // [-t…+t]
    const v = vNorm + noise; // [−t…1+t]
    channel[i] = v > 0.5 ? 255 : 0; // поріг 0.5
  }
}

// ——— Jarvis–Judice–Ninke (JJN) ———
function ditherJJN(channel, w, h, t) {
  const err = Array(h)
    .fill()
    .map(() => new Float32Array(w));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const oldV = channel[i] + err[y][x];
      const newV = oldV > 127 ? 255 : 0;
      const qe = oldV - newV;
      channel[i] = newV;
      const w7 = (7 / 48) * t;
      const w5 = (5 / 48) * t;
      const w3 = (3 / 48) * t;
      const w1 = (1 / 48) * t;
      // row y
      if (x + 1 < w) err[y][x + 1] += qe * w7;
      if (x + 2 < w) err[y][x + 2] += qe * w5;
      // row y+1
      if (y + 1 < h) {
        if (x - 2 >= 0) err[y + 1][x - 2] += qe * w3;
        if (x - 1 >= 0) err[y + 1][x - 1] += qe * w5;
        err[y + 1][x] += qe * w7;
        if (x + 1 < w) err[y + 1][x + 1] += qe * w5;
        if (x + 2 < w) err[y + 1][x + 2] += qe * w3;
      }
      // row y+2
      if (y + 2 < h) {
        if (x - 2 >= 0) err[y + 2][x - 2] += qe * w1;
        if (x - 1 >= 0) err[y + 2][x - 1] += qe * w3;
        err[y + 2][x] += qe * w5;
        if (x + 1 < w) err[y + 2][x + 1] += qe * w3;
        if (x + 2 < w) err[y + 2][x + 2] += qe * w1;
      }
    }
  }
}

// ——— Sierra-3 (три рядки) ———
function ditherSierra3(channel, w, h, t) {
  const err = Array(h)
    .fill()
    .map(() => new Float32Array(w));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const oldV = channel[i] + err[y][x];
      const newV = oldV > 127 ? 255 : 0;
      const qe = oldV - newV;
      channel[i] = newV;
      const w5 = (5 / 32) * t;
      const w4 = (4 / 32) * t;
      const w3 = (3 / 32) * t;
      const w2 = (2 / 32) * t;
      // Row y
      if (x + 1 < w) err[y][x + 1] += qe * w5;
      if (x + 2 < w) err[y][x + 2] += qe * w3;
      // Row y+1
      if (y + 1 < h) {
        if (x - 2 >= 0) err[y + 1][x - 2] += qe * w2;
        if (x - 1 >= 0) err[y + 1][x - 1] += qe * w4;
        err[y + 1][x] += qe * w5;
        if (x + 1 < w) err[y + 1][x + 1] += qe * w4;
        if (x + 2 < w) err[y + 1][x + 2] += qe * w2;
      }
      // Row y+2
      if (y + 2 < h) {
        if (x - 1 >= 0) err[y + 2][x - 1] += qe * w2;
        err[y + 2][x] += qe * w3;
        if (x + 1 < w) err[y + 2][x + 1] += qe * w2;
      }
    }
  }
}

// ——— Stucki ———
function ditherStucki(channel, w, h, t) {
  const err = Array(h)
    .fill()
    .map(() => new Float32Array(w));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const oldV = channel[i] + err[y][x];
      const newV = oldV > 127 ? 255 : 0;
      const qe = oldV - newV;
      channel[i] = newV;
      const w8 = (8 / 42) * t;
      const w4 = (4 / 42) * t;
      const w2 = (2 / 42) * t;
      const w1 = (1 / 42) * t;
      if (x + 1 < w) err[y][x + 1] += qe * w8;
      if (x + 2 < w) err[y][x + 2] += qe * w4;
      if (y + 1 < h) {
        if (x - 2 >= 0) err[y + 1][x - 2] += qe * w2;
        if (x - 1 >= 0) err[y + 1][x - 1] += qe * w4;
        err[y + 1][x] += qe * w8;
        if (x + 1 < w) err[y + 1][x + 1] += qe * w4;
        if (x + 2 < w) err[y + 1][x + 2] += qe * w2;
      }
      if (y + 2 < h) {
        if (x - 2 >= 0) err[y + 2][x - 2] += qe * w1;
        if (x - 1 >= 0) err[y + 2][x - 1] += qe * w2;
        err[y + 2][x] += qe * w4;
        if (x + 1 < w) err[y + 2][x + 1] += qe * w2;
        if (x + 2 < w) err[y + 2][x + 2] += qe * w1;
      }
    }
  }
}

// ——— Burkes ———
function ditherBurkes(channel, w, h, t) {
  const err = Array(h)
    .fill()
    .map(() => new Float32Array(w));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const oldV = channel[i] + err[y][x];
      const newV = oldV > 127 ? 255 : 0;
      const qe = oldV - newV;
      channel[i] = newV;
      const w8 = (8 / 32) * t;
      const w4 = (4 / 32) * t;
      const w2 = (2 / 32) * t;
      if (x + 1 < w) err[y][x + 1] += qe * w8;
      if (x + 2 < w) err[y][x + 2] += qe * w4;
      if (y + 1 < h) {
        if (x - 2 >= 0) err[y + 1][x - 2] += qe * w2;
        if (x - 1 >= 0) err[y + 1][x - 1] += qe * w4;
        err[y + 1][x] += qe * w8;
        if (x + 1 < w) err[y + 1][x + 1] += qe * w4;
        if (x + 2 < w) err[y + 1][x + 2] += qe * w2;
      }
    }
  }
}

// ——— Clustered Ordered Dithering (4×4) ———
const CLUSTER_MASK = [
  [0, 2, 3, 1],
  [3, 1, 0, 2],
  [2, 0, 1, 3],
  [1, 3, 2, 0],
];
function ditherClustered(channel, w, h, t) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const vNorm = channel[i] / 255;
      const cls = CLUSTER_MASK[y % 4][x % 4] / 4;
      const thr = (1 - t) * 0.5 + t * cls;
      channel[i] = vNorm > thr ? 255 : 0;
    }
  }
}

// ——— Random Threshold Dithering ———
function ditherRandomThreshold(channel, w, h, t) {
  const rng = () => Math.random();
  for (let i = 0, size = w * h; i < size; i++) {
    const vNorm = channel[i] / 255;
    const thr = (1 - t) * 0.5 + t * rng();
    channel[i] = vNorm > thr ? 255 : 0;
  }
}

// ——— Generic matrix-based ordered dithering ———
function createMatrixDither(matrix, denom) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  if (denom === undefined || denom === null) {
    let maxV = 0;
    for (const row of matrix) for (const v of row) if (v > maxV) maxV = v;
    denom = maxV + 1;
  }
  return function (channel, w, h, t) {
    for (let y = 0; y < h; y++) {
      const r = matrix[y % rows];
      const base = y * w;
      for (let x = 0; x < w; x++) {
        const idx = base + x;
        const vNorm = channel[idx] / 255;
        const m = r[x % cols] / denom;
        const thr = (1 - t) * 0.5 + t * m;
        channel[idx] = vNorm > thr ? 255 : 0;
      }
    }
  };
}

// 7x7 multi-level diagonal pattern (8 градацій, як на зразку)
// Кожне число — "поріг" для появи діагональної лінії (0…7)
const THRESHOLD7 = [
  [0, 5, 3, 1, 6, 4, 2],
  [5, 3, 1, 6, 4, 2, 0],
  [3, 1, 6, 4, 2, 0, 5],
  [1, 6, 4, 2, 0, 5, 3],
  [6, 4, 2, 0, 5, 3, 1],
  [4, 2, 0, 5, 3, 1, 6],
  [2, 0, 5, 3, 1, 6, 4],
];

/**
 * 7×7 діагональний дізеринг по одному каналу
 * @param {Uint8Array|Float32Array} channel — буфер одного каналу (0…255)
 * @param {number} w — ширина
 * @param {number} h — висота
 * @param {number} t — сила дізерингу 0…1 (0 = ні, 1 = повний)
 */
const ditherLineDiag7x7 = createMatrixDither(THRESHOLD7, 7);

// dot-matrix 5x5
// Кожне число — "поріг" для появи діагональної лінії (0…6)
const dotMatrix5 = [
  [0, 1, 2, 1, 0],
  [1, 3, 4, 3, 1],
  [2, 4, 5, 4, 2],
  [1, 3, 4, 3, 1],
  [0, 1, 2, 1, 0]
];

/**
 * dot matrix 5x5
 * @param {Uint8Array|Float32Array} channel — буфер одного каналу (0…255)
 * @param {number} w — ширина
 * @param {number} h — висота
 * @param {number} t — сила дізерингу 0…1 (0 = ні, 1 = повний)
 */
const dotMatrix5x5 = createMatrixDither(dotMatrix5, 6);


module.exports = {
  thr: threshold,
  fs: ditherFS,
  jjn: ditherJJN,
  sierra3: ditherSierra3,
  stucki: ditherStucki,
  burkes: ditherBurkes,
  atkinson: ditherAtkinson,
  bayer: ditherBayer,
  bayer4: ditherBayer4,
  bayer2: ditherBayer2,
  bluenoise: ditherBlueNoise,
  // dotdiff:       ditherDotDiffusionTrue,
  clustered: ditherClustered,
  random: ditherRandomThreshold,
  linediag7x7: ditherLineDiag7x7,
  dotmatrix5: dotMatrix5x5,
  checker2x1: ditherCheckerboard2x1,
};
