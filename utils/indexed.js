// utils/indexed.js
// Conversion between RGBA buffers and ZX Spectrum indexed representation

// Import universal palettes
const { ZX_BASE, ZX_FULL } = require('./palette');

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
      // Знаходимо всі кольори, що зустрічаються в блоці
      const present = [];
      for (let i = 0; i < freq.length; i++) {
        if (freq[i] > 0) present.push(i);
      }
      let ink, paper;
      if (present.length === 1) {
        ink = paper = present[0];
      } else {
        paper = Math.max(...present);
        ink = Math.min(...present);
      }
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

function indexedToRgba({ pixels, attrs, width: w, height: h }, swapFlash = false) {
  const rgba = new Uint8Array(w * h * 4);
  const cols = w >> 3;
  for (let y = 0; y < h; y++) {
    const by = y >> 3;
    for (let x = 0; x < w; x++) {
      const bx = x >> 3;
      const attr = attrs[by * cols + bx];
      let idx = pixels[y * w + x];
      if (swapFlash && attr.flash) {
        if (idx === attr.ink) idx = attr.paper; else if (idx === attr.paper) idx = attr.ink;
      }
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

function _isImageDark(indexed) {
  const { pixels } = indexed;
  let sum = 0;
  for (const idx of pixels) sum += idx;
  const threshold = (pixels.length * 7) / 2;
  return sum < threshold;
}

function optimizeAttributes(indexed) {
  const { pixels, attrs, width: w, height: h } = indexed;
  const cols = w >> 3;
  const rows = h >> 3;
  const isDark = _isImageDark(indexed);
  const single = [];
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (isDark) { //"темна" картинка
      if (attr.paper > attr.ink) {
        const t = attr.paper; attr.paper = attr.ink; attr.ink = t;
      }
    } else { //"світла"
      if (attr.paper < attr.ink) {
        const t = attr.paper; attr.paper = attr.ink; attr.ink = t;
      }
    }
    if (attr.ink === attr.paper) single.push(i);
  }

  if (single.length === attrs.length) {
    for (const i of single) {
      const attr = attrs[i];
      attr.ink = (7 - attr.paper) & 7;
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bi = (y >> 3) * cols + (x >> 3);
        pixels[y * w + x] = attrs[bi].paper;
      }
    }
  }
}

module.exports = {
  rgbaToIndexed,
  indexedToRgba,
  computeBrightAttrs,
  ZX_BASE,
  ZX_FULL,
  rgbToIndex,
  optimizeAttributes,
};
