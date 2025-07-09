const { ZX_BASE_255 } = require('../utils/palette');

function reduceToDominantPair(rgba, w, h) {
  const ZX_BASE = ZX_BASE_255;

  const blocksX = Math.floor(w / 8);
  const blocksY = Math.floor(h / 8);

  // Для кожного 8×8-блоку:
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // 1. Рахуємо частоти індексів палітри
      const freq = new Array(8).fill(0);
      const nearest = new Array(64);
      let p = 0;
      for (let dy = 0; dy < 8; dy++) {
        const y = by * 8 + dy;
        for (let dx = 0; dx < 8; dx++) {
          const x = bx * 8 + dx;
          const i = (y * w + x) * 4;
          let minD = Infinity, minIdx = 0;
          for (let pi = 0; pi < 8; pi++) {
            const pal = ZX_BASE[pi];
            const d = (rgba[i] - pal[0])**2 + (rgba[i+1] - pal[1])**2 + (rgba[i+2] - pal[2])**2;
            if (d < minD) { minD = d; minIdx = pi; }
          }
          freq[minIdx]++;
          nearest[p++] = minIdx;
        }
      }
      // 2. Два найчастіші індекси
      const top = freq.map((count, idx) => ({ count, idx }))
        .sort((a, b) => b.count - a.count);
      const idxA = top[0].idx;
      const idxB = top[1]?.idx ?? idxA;

      // 3. Для кожного пікселя — приводимо до найближчого індексом:
      p = 0;
      for (let dy = 0; dy < 8; dy++) {
        const y = by * 8 + dy;
        for (let dx = 0; dx < 8; dx++) {
          const x = bx * 8 + dx;
          const i = (y * w + x) * 4;
          const minIdx = nearest[p++];
          // ближчий індекс за абсолютною різницею (по колу — якщо потрібно)
          const dToA = Math.abs(minIdx - idxA);
          const dToB = Math.abs(minIdx - idxB);
          const useIdx = dToA <= dToB ? idxA : idxB;
          const [r, g, b] = ZX_BASE[useIdx];
          rgba[i]   = r;
          rgba[i+1] = g;
          rgba[i+2] = b;
        }
      }
    }
  }
}
module.exports = { reduceToDominantPair };
