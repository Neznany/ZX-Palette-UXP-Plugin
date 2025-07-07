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

// Helper palette including bright variants (skip bright black)
const ZX_FULL = [];
for (let i = 0; i < 8; i++) ZX_FULL.push({ rgb: ZX_BASE[i], bright: false });
for (let i = 1; i < 8; i++) {
  const [r, g, b] = ZX_BASE[i].map(v => (v === 0 ? 0 : 255));
  ZX_FULL.push({ rgb: [r, g, b], bright: true });
}

function rgbToIndex(r, g, b) {
  const rBit = r >= 128 ? 1 : 0;
  const gBit = g >= 128 ? 1 : 0;
  const bBit = b >= 128 ? 1 : 0;
  return (gBit << 2) | (rBit << 1) | bBit;
}

function computeBrightAttrs(rgba, w, h) {
  const cols = w >> 3;
  const rows = h >> 3;
  const bits = new Uint8Array(cols * rows);
  const blackBuf = [];
  let brightBlocks = 0;
  let darkBlocks = 0;
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const freq = new Array(ZX_FULL.length).fill(0);
      for (let dy = 0; dy < 8; dy++) {
        const y = by * 8 + dy;
        for (let dx = 0; dx < 8; dx++) {
          const x = bx * 8 + dx;
          const p = (y * w + x) * 4;
          const r = rgba[p];
          const g = rgba[p + 1];
          const b = rgba[p + 2];
          let best = 0;
          let bd = Infinity;
          for (let i = 0; i < ZX_FULL.length; i++) {
            const pr = ZX_FULL[i].rgb[0];
            const pg = ZX_FULL[i].rgb[1];
            const pb = ZX_FULL[i].rgb[2];
            const d = (pr - r) * (pr - r) + (pg - g) * (pg - g) + (pb - b) * (pb - b);
            if (d < bd) { bd = d; best = i; }
          }
          freq[best]++;
        }
      }
      const sorted = freq.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c);
      const idxA = sorted[0].i;
      const idxB = sorted[1] ? sorted[1].i : idxA;
      const bi = by * cols + bx;
      if (idxA === 0 && freq[idxA] === 64) {
        blackBuf.push(bi);
        continue;
      }
      const pair = [ { idx: idxA, count: freq[idxA] }, { idx: idxB, count: freq[idxB] } ];
      let brightScore = 0;
      let darkScore = 0;
      for (const { idx, count } of pair) {
        if (idx === 0) continue; // ignore black
        if (ZX_FULL[idx].bright) brightScore += count; else darkScore += count;
      }
      const bit = brightScore >= darkScore ? 1 : 0;
      bits[bi] = bit;
      if (bit) brightBlocks++; else darkBlocks++;
    }
  }
  const majority = (brightBlocks + darkBlocks) ? (brightBlocks >= darkBlocks ? 1 : 0) : 0;
  for (const bi of blackBuf) bits[bi] = majority;
  return bits;
}

function rgbaToIndexed(rgba, w, h, opts = {}) {
  const { bright = 0, flash = 0, brightBits = null } = opts;
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
      const blockBright = brightBits ? brightBits[a] : bright;
      attrs[a++] = { ink, paper, bright: blockBright, flash };
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

module.exports = { rgbaToIndexed, indexedToRgba, computeBrightAttrs, ZX_BASE };
