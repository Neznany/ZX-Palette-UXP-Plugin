// utils/indexed.js
// Conversion between RGBA buffers and ZX Spectrum indexed representation

const ZX_BASE = [
  [0, 0, 0],
  [0, 0, 192],
  [192, 0, 0],
  [192, 0, 192],
  [0, 192, 0],
  [0, 192, 192],
  [192, 192, 0],
  [192, 192, 192],
];

function rgbToIndex(r, g, b) {
  const rBit = r >= 128 ? 1 : 0;
  const gBit = g >= 128 ? 1 : 0;
  const bBit = b >= 128 ? 1 : 0;
  return (gBit << 2) | (rBit << 1) | bBit;
}

function rgbaToIndexed(rgba, w, h, opts = {}) {
  const { bright = 0, flash = 0 } = opts;
  const pixels = new Uint8Array(w * h);
  const cols = w >> 3;
  const rows = h >> 3;
  const attrs = new Array(cols * rows);
  let a = 0;
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const freq = new Array(8).fill(0);
      for (let dy = 0; dy < 8; dy++) {
        const y = by * 8 + dy;
        for (let dx = 0; dx < 8; dx++) {
          const x = bx * 8 + dx;
          const i4 = (y * w + x) * 4;
          const idx = rgbToIndex(rgba[i4], rgba[i4 + 1], rgba[i4 + 2]);
          pixels[y * w + x] = idx;
          freq[idx]++;
        }
      }
      const top = freq.map((count, idx) => ({ count, idx }))
        .sort((a, b) => b.count - a.count);
      const ink = top[0].idx;
      const paper = (top[1] ? top[1].idx : ink);
      attrs[a++] = { ink, paper, bright, flash };
    }
  }
  return { pixels, attrs, width: w, height: h };
}

function indexToRgb(idx, bright) {
  const base = ZX_BASE[idx];
  if (bright && idx) {
    return base.map(v => (v === 0 ? 0 : 255));
  }
  return base;
}

function indexedToRgba({ pixels, attrs, width: w, height: h }) {
  const rgba = new Uint8Array(w * h * 4);
  const cols = w >> 3;
  for (let y = 0; y < h; y++) {
    const by = y >> 3;
    for (let x = 0; x < w; x++) {
      const bx = x >> 3;
      const attr = attrs[by * cols + bx];
      const idx = pixels[y * w + x];
      const [r, g, b] = indexToRgb(idx, attr.bright);
      const p = (y * w + x) * 4;
      rgba[p] = r;
      rgba[p + 1] = g;
      rgba[p + 2] = b;
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

module.exports = { rgbaToIndexed, indexedToRgba, ZX_BASE };
