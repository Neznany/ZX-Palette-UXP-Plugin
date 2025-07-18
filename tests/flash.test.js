const assert = require('assert');
const { rgbaToIndexed, applyFlashAttrs } = require('../utils/indexed');

const W = 8, H = 8;
const base = new Uint8Array(W * H * 4);
// fill with black (zeros) and opaque
for (let i = 0; i < base.length; i += 4) {
  base[i] = 0; base[i+1] = 0; base[i+2] = 0; base[i+3] = 255;
}
const idx = rgbaToIndexed(base, W, H, { bright: 0, flash: 0 });

const flash = new Uint8Array(W * H * 4);
for (let i = 0; i < flash.length; i += 4) {
  flash[i] = 255; flash[i+1] = 0; flash[i+2] = 0; flash[i+3] = 255;
}

applyFlashAttrs(idx, flash, W, H);

assert.strictEqual(idx.attrs[0].flash, 1);
assert.strictEqual(idx.attrs[0].ink, 2);
console.log('applyFlashAttrs test passed');
