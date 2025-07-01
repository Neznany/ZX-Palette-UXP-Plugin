// Run tests with:
//   node tests/color.test.js

const assert = require('assert');
const { rgbToHsl, hslToRgb } = require('../utils/color');

// Sample RGB triples
const samples = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 0, 0],
  [123, 45, 67],
];

samples.forEach((rgb) => {
  const hsl = rgbToHsl(...rgb);
  const result = hslToRgb(...hsl);
  assert.deepStrictEqual(result, rgb);
});

console.log('All tests passed');
