// tests/scr.test.js
// Run with: node tests/scr.test.js

const assert = require('assert');
const { encodeTiles, decodeScr } = require('../utils/scr');

function makeIndexed(W, H, ink = 1, paper = 0) {
  const pixels = new Uint8Array(W * H);
  pixels.fill(ink);
  const cols = Math.ceil(W / 8);
  const rows = Math.ceil(H / 8);
  const attrs = new Array(cols * rows).fill(0).map(() => ({ ink, paper, bright: 0, flash: 0 }));
  return { pixels, attrs, width: W, height: H };
}


// Case 1: 64x64
(() => {
  const idx = makeIndexed(64, 64);
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 1);
  const d = decodeScr(tiles[0].bytes);
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
      if (by < 8 && bx < 8) assert.strictEqual(a, 8);
      else assert.strictEqual(a, 7);
    }
  }
})();

// Case 2: exactly 256x192
(() => {
  const idx = makeIndexed(256, 192, 2);
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 1);
  const d = decodeScr(tiles[0].bytes);
  for (const v of d.pixels) assert.strictEqual(v, 1);
  for (const a of d.attrs) assert.strictEqual(a, 16);
})();

// Case 3: 512x64 -> two tiles
(() => {
  const idx = makeIndexed(512, 64);
  const tiles = encodeTiles(idx);
  assert.strictEqual(tiles.length, 2);
  tiles.forEach((t, i) => {
    const d = decodeScr(t.bytes);
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
    const d = decodeScr(t.bytes);
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
  const d = decodeScr(tiles[0].bytes);
  for (let i = 0; i < d.pixels.length; i++) {
    const val = d.pixels[i];
    const x = i % 256;
    const y = Math.floor(i / 256);
    if (x < 8 && y < 8) assert.strictEqual(val, 3); else assert.strictEqual(val, 0);
  }
  for (let i = 0; i < d.attrs.length; i++) {
    const a = d.attrs[i];
    if (i === 0) assert.strictEqual(a, 35); else assert.strictEqual(a, 7);
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
  const d = decodeScr(tiles[0].bytes);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 16; x++) {
      const val = d.pixels[y * 256 + x];
      if (x < 8) assert.strictEqual(val, 0); else assert.strictEqual(val, 1);
    }
  }
  const a0 = d.attrs[0];
  const a1 = d.attrs[1];
  assert.strictEqual(a0, 0);
  assert.strictEqual(a1, 8);
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
  const d = decodeScr(tiles[0].bytes);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 24; x++) {
      const val = d.pixels[y * 256 + x];
      if (x < 8) assert.strictEqual(val, 1); else assert.strictEqual(val, 0);
    }
  }
})();

console.log('SCR tiling tests passed');
