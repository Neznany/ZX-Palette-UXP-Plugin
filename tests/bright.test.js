// tests/bright.test.js
// Run with: node tests/bright.test.js

const assert = require('assert');
const { rgbaToIndexed, indexedToRgba, computeBrightAttrs, ZX_BASE } = require('../utils/indexed');

const W = 16, H = 8; // two blocks horizontally
const rgba = new Uint8Array(W * H * 4);

// block 0: half bright blue, half black
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    const p = (y * W + x) * 4;
    if (x < 4) { // bright blue
      rgba[p] = 0; rgba[p+1] = 0; rgba[p+2] = 255; rgba[p+3] = 255;
    } else { // black
      rgba[p] = 0; rgba[p+1] = 0; rgba[p+2] = 0; rgba[p+3] = 255;
    }
  }
}

// block 1: fully black
for (let y = 0; y < 8; y++) {
  for (let x = 8; x < 16; x++) {
    const p = (y * W + x) * 4;
    rgba[p] = 0; rgba[p+1] = 0; rgba[p+2] = 0; rgba[p+3] = 255;
  }
}

const bits = computeBrightAttrs(rgba, W, H);
assert.strictEqual(bits.length, 2);
assert.strictEqual(bits[0], 1); // bright due to blue
assert.strictEqual(bits[1], 1); // inherits majority brightness

const indexed = rgbaToIndexed(rgba, W, H, { brightBits: bits, flash: 0, bright: 0 });

assert.strictEqual(indexed.attrs[0].bright, 1);
assert.strictEqual(indexed.attrs[1].bright, 1);

const round = indexedToRgba(indexed);
assert.strictEqual(round.length, rgba.length);

console.log('Auto-bright tests passed');

