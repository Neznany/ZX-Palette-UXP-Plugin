const assert = require('assert');
const { convertTo8BitRgba } = require('../utils/utils');

// RGBA input in 16 bits per channel
const dataRgba16 = new Uint16Array([
  65535, 32768, 0, 65535, // pixel 0
  0, 32768, 65535, 0      // pixel 1
]);
const out1 = convertTo8BitRgba(dataRgba16, 2);
assert.deepStrictEqual(Array.from(out1), [255, 128, 0, 255, 0, 128, 255, 0]);

// RGB input in 16 bits per channel
const dataRgb16 = new Uint16Array([
  0, 65535, 32768, // pixel 0
  65535, 0, 0      // pixel 1
]);
const out2 = convertTo8BitRgba(dataRgb16, 2);
assert.deepStrictEqual(Array.from(out2), [0, 255, 128, 255, 255, 0, 0, 255]);

console.log('Bit depth 16 conversion tests passed');
