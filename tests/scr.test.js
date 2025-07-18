// tests/scr.test.js
// Run with: node tests/scr.test.js

const assert = require('assert');
const { encodeTiles } = require('../utils/scr');

function makeIndexed(W, H, ink = 1, paper = 0) {
  const pixels = new Uint8Array(W * H);
  pixels.fill(ink);
  const cols = Math.ceil(W / 8);
  const rows = Math.ceil(H / 8);
  const attrs = new Array(cols * rows).fill(0).map(() => ({ ink, paper, bright: 0, flash: 0 }));
  return { pixels, attrs, width: W, height: H };
}

function decode(scr) {
  const pixels = new Uint8Array(256 * 192);
  for (let y = 0; y < 192; y++) {
    for (let xb = 0; xb < 32; xb++) {
      const addr = ((y & 0xC0) << 5) | ((y & 0x38) << 2) | ((y & 0x07) << 8) | xb;
      const byte = scr[addr];
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        pixels[y * 256 + x] = (byte >> (7 - bit)) & 1;
      }
    }
  }
  const attrs = new Uint8Array(32 * 24);
  for (let by = 0; by < 24; by++) {
    for (let bx = 0; bx < 32; bx++) {
      attrs[by * 32 + bx] = scr[6144 + by * 32 + bx];
    }
  }
  return { pixels, attrs };
}

// Case 1: 64x64
(() => {
  const idx = makeIndexed(64, 64);
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 1);
  const d = decode(tiles[0].bytes);
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 256; x++) {
      const val = d.pixels[y * 256 + x];
      if (y < 64 && x < 64) assert.strictEqual(val, 1);
      else assert.strictEqual(val, 0);
    }
  }
  for (let by = 0; by < 24; by++) {
    for (let bx = 0; bx < 32; bx++) {
      const a = d.attrs[by * 32 + bx];
      if (by < 8 && bx < 8) assert.strictEqual(a, 1);
      else assert.strictEqual(a, 7);
    }
  }
})();

// Case 2: exactly 256x192
(() => {
  const idx = makeIndexed(256, 192, 2);
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 1);
  const d = decode(tiles[0].bytes);
  for (const v of d.pixels) assert.strictEqual(v, 1);
  for (const a of d.attrs) assert.strictEqual(a, 2);
})();

// Case 3: 512x64 -> two tiles
(() => {
  const idx = makeIndexed(512, 64);
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 2);
  tiles.forEach((t, i) => {
    const d = decode(t.bytes);
    for (let y = 0; y < 192; y++) {
      for (let x = 0; x < 256; x++) {
        const val = d.pixels[y * 256 + x];
        if (y < 64) assert.strictEqual(val, 1);
        else assert.strictEqual(val, 0);
      }
    }
  });
})();

// Case 4: 300x200 -> four tiles
(() => {
  const idx = makeIndexed(300, 200);
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 4);
  tiles.forEach(t => {
    const d = decode(t.bytes);
    for (let y = 0; y < 192; y++) {
      for (let x = 0; x < 256; x++) {
        const inDocX = t.tx * 256 + x < 300;
        const inDocY = t.ty * 192 + y < 200;
        const val = d.pixels[y * 256 + x];
        if (inDocX && inDocY) assert.strictEqual(val, 1);
        else assert.strictEqual(val, 0);
      }
    }
  });
})();

// Case 5: INK equals PAPER -> pixels should be 0
(() => {
  const idx = makeIndexed(8, 8, 3, 3);
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 1);
  const d = decode(tiles[0].bytes);
  for (const val of d.pixels) assert.strictEqual(val, 0);
  for (let i = 0; i < d.attrs.length; i++) {
    const a = d.attrs[i];
    if (i === 0) assert.strictEqual(a, 28); else assert.strictEqual(a, 7);
  }
})();

// Case 6: uniform block neighbours majority 1
(() => {
  const W = 16; const H = 8;
  const pixels = new Uint8Array(W * H);
  const attrs = [
    { ink: 0, paper: 0, bright: 0, flash: 0 },
    { ink: 1, paper: 0, bright: 0, flash: 0 },
  ];
  for (let y = 0; y < 8; y++) {
    for (let x = 8; x < 16; x++) {
      pixels[y * W + x] = 1;
    }
  }
  const idx = { pixels, attrs, width: W, height: H };
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 1);
  const d = decode(tiles[0].bytes);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 16; x++) {
      const val = d.pixels[y * 256 + x];
      assert.strictEqual(val, 1);
    }
  }
  const a0 = d.attrs[0];
  const a1 = d.attrs[1];
  assert.strictEqual(a0, 0);
  assert.strictEqual(a1, 1);
})();

// Case 7: propagation through multiple uniform blocks
(() => {
  const W = 24; const H = 8;
  const pixels = new Uint8Array(W * H);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) pixels[y * W + x] = 1;
  }
  const attrs = [
    { ink: 1, paper: 0, bright: 0, flash: 0 },
    { ink: 0, paper: 0, bright: 0, flash: 0 },
    { ink: 0, paper: 0, bright: 0, flash: 0 },
  ];
  const idx = { pixels, attrs, width: W, height: H };
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 1);
  const d = decode(tiles[0].bytes);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 24; x++) {
      const val = d.pixels[y * 256 + x];
      assert.strictEqual(val, 1);
    }
  }
})();

console.log('SCR tiling tests passed');
