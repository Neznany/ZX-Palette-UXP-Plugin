// utils/scr.js
// Encoding ZX Spectrum SCR files with tiling support

// relative positions of neighbouring blocks used when resolving uniform blocks
const NEIGHBOR_OFFSETS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1]
];

function encodeTile(indexed, tx = 0, ty = 0) {
  const { pixels, attrs, width: W, height: H } = indexed;
  const wBlocks = Math.ceil(W / 8);
  const hBlocks = Math.ceil(H / 8);
  const scr = new Uint8Array(6912);
  scr.fill(0);
  // attributes occupy last 768 bytes of the .scr buffer
  const defaultAttr = 7; // INK=7, PAPER=0, BRIGHT=0, FLASH=0
  scr.fill(defaultAttr, 6144);

  const startBx = tx * 32;
  const startBy = ty * 24;
  const cols = Math.min(32, wBlocks - startBx);
  const rows = Math.min(24, hBlocks - startBy);

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const aIdx = (startBy + by) * wBlocks + (startBx + bx);
      const attr = attrs[aIdx] || { ink: 7, paper: 0, bright: 0, flash: 0 };

      let fillByte = 0;
      // if block uses only one color we approximate pixels using neighbours
      if (attr.ink === attr.paper) {
        let ones = 0;
        let zeros = 0;
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
          const nbx = startBx + bx + dx;
          const nby = startBy + by + dy;
          if (nbx < 0 || nbx >= wBlocks || nby < 0 || nby >= hBlocks) continue;
          const nAttr = attrs[nby * wBlocks + nbx];
          if (!nAttr || nAttr.ink === nAttr.paper) continue;
          for (let sy = 0; sy < 8; sy++) {
            const y = nby * 8 + sy;
            if (y >= H) continue;
            for (let sx = 0; sx < 8; sx++) {
              const x = nbx * 8 + sx;
              if (x >= W) continue;
              const idx = pixels[y * W + x];
              if (idx === nAttr.ink) ones++; else zeros++;
            }
          }
        }
        fillByte = ones > zeros ? 0xFF : 0x00;
      }
      fillByte = 0xFF;

      for (let dy = 0; dy < 8; dy++) {
        const y = by * 8 + dy;
        const yGlobal = (startBy + by) * 8 + dy;
        // ZX video memory layout: bits of Y coordinate are split across banks
        const bankOffset = (y & 0xC0) << 5;
        const rowOffset = (y & 0x38) << 2;
        const lineOffset = (y & 0x07) << 8;
        const baseAddr = bankOffset | rowOffset | lineOffset | bx;
        if (attr.ink === attr.paper) {
          scr[baseAddr] = fillByte;
          continue;
        }
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const xGlobal = (startBx + bx) * 8 + bit;
          let idx = 0;
          if (xGlobal < W && yGlobal < H) idx = pixels[yGlobal * W + xGlobal];
          byte |= (idx === attr.ink ? 1 : 0) << (7 - bit);
        }
        scr[baseAddr] = byte;
      }
      const attrAddr = 6144 + by * 32 + bx;
      scr[attrAddr] = ((attr.flash ? 1 : 0) << 7) |
        ((attr.bright ? 1 : 0) << 6) |
        ((attr.paper & 7) << 3) |
        (attr.ink & 7);
    }
  }

  return scr;
}

const { optimizeAttributes } = require('./indexed');

// Split large images into 256x192 tiles encoded as individual .scr buffers
function encodeTiles(indexed) {
  // tweak attributes globally before tiling
  optimizeAttributes(indexed);
  const tilesX = Math.ceil(indexed.width / 256);
  const tilesY = Math.ceil(indexed.height / 192);
  const tiles = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      tiles.push({ tx, ty, bytes: encodeTile(indexed, tx, ty) });
    }
  }
  return tiles;
}

module.exports = { encodeTile, encodeTiles };
