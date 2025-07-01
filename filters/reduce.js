/**
 * Reduce each 8×8 block to its two most frequent colors,
 * remapping all other pixels to the nearest of those two.
 *
 * @param {Uint8Array} rgba — RGBA pixel data
 * @param {number} w — image width
 * @param {number} h — image height
 */
function reduceToDominantPair(rgba, w, h) {
  const blocksX = Math.floor(w / 8);
  const blocksY = Math.floor(h / 8);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // 1) Count occurrences of each color in the block
      const freq = new Map();  // key: "r,g,b", value: count
      for (let dy = 0; dy < 8; dy++) {
        const y = by * 8 + dy;
        for (let dx = 0; dx < 8; dx++) {
          const x = bx * 8 + dx;
          const i = (y * w + x) * 4;
          const key = `${rgba[i]},${rgba[i+1]},${rgba[i+2]}`;
          freq.set(key, (freq.get(key) || 0) + 1);
        }
      }

      // 2) Find the two most frequent colors
      const sorted = [...freq.entries()]
        .sort((a, b) => b[1] - a[1]);
      const [keyA,] = sorted[0] || ["0,0,0"];
      const [keyB,] = sorted[1] || [keyA];
      const [rA, gA, bA] = keyA.split(",").map(Number);
      const [rB, gB, bB] = keyB.split(",").map(Number);

      // 3) For each pixel, if not one of the two, remap to nearest
      for (let dy = 0; dy < 8; dy++) {
        const y = by * 8 + dy;
        for (let dx = 0; dx < 8; dx++) {
          const x = bx * 8 + dx;
          const i = (y * w + x) * 4;
          const r = rgba[i], g = rgba[i+1], b = rgba[i+2];
          const key = `${r},${g},${b}`;
          if (key !== keyA && key !== keyB) {
            // compute squared dist to A and B
            const dA = (r - rA)**2 + (g - gA)**2 + (b - bA)**2;
            const dB = (r - rB)**2 + (g - gB)**2 + (b - bB)**2;
            if (dA <= dB) {
              rgba[i] = rA; rgba[i+1] = gA; rgba[i+2] = bA;
            } else {
              rgba[i] = rB; rgba[i+1] = gB; rgba[i+2] = bB;
            }
          }
        }
      }
    }
  }
}

module.exports = { reduceToDominantPair };