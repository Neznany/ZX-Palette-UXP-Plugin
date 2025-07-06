// tests/indexed.test.js
// Run with: node tests/indexed.test.js

const assert = require('assert');
const { rgbaToIndexed, indexedToRgba, ZX_BASE } = require('../utils/indexed');

// simple old encoder copied from previous implementation
function oldEncodeScr(rgba, W, H, bright) {
  function mapPalIndex(rgb) {
    const ZX_PALETTE = [];
    for (let i = 0; i < 8; i++) ZX_PALETTE.push({ rgb: ZX_BASE[i], bright: false });
    for (let i = 1; i < 8; i++) {
      const [r, g, b] = ZX_BASE[i].map(v => (v === 0 ? 0 : 255));
      ZX_PALETTE.push({ rgb: [r, g, b], bright: true });
    }
    let best = 0, bd = Infinity;
    ZX_PALETTE.forEach((p,i) => {
      const dr = p.rgb[0]-rgb[0];
      const dg = p.rgb[1]-rgb[1];
      const db = p.rgb[2]-rgb[2];
      const d = dr*dr + dg*dg + db*db;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  const scrBytes = new Uint8Array(6912);
  scrBytes.fill(0);
  const cols = W >> 3, rows = H >> 3;
  for (let by=0; by<rows; by++) {
    for (let bx=0; bx<cols; bx++) {
      const freq = new Map();
      for (let dy=0; dy<8; dy++) {
        const y = by*8 + dy;
        for (let dx=0; dx<8; dx++) {
          const x = bx*8 + dx;
          const i4 = (y*W + x)*4;
          const key = `${rgba[i4]},${rgba[i4+1]},${rgba[i4+2]}`;
          freq.set(key, (freq.get(key)||0)+1);
        }
      }
      const sorted = [...freq.entries()].sort((a,b)=>b[1]-a[1]);
      const inkRgb = sorted[0][0].split(',').map(Number);
      const paperRgb = (sorted[1]||sorted[0])[0].split(',').map(Number);
      for (let dy=0; dy<8; dy++) {
        const y = by*8 + dy;
        const bankOffset = (y & 0xC0) << 5;
        const rowOffset  = (y & 0x38) << 2;
        const lineOffset = (y & 0x07) << 8;
        const baseAddr   = bankOffset | rowOffset | lineOffset | bx;
        let byte = 0;
        for (let bit=0; bit<8; bit++) {
          const x = bx*8 + bit;
          const i4 = (y*W + x)*4;
          const matchInk = rgba[i4]===inkRgb[0] && rgba[i4+1]===inkRgb[1] && rgba[i4+2]===inkRgb[2];
          byte |= (matchInk?1:0) << (7-bit);
        }
        scrBytes[baseAddr] = byte;
      }
      const rawInkIdx = mapPalIndex(inkRgb);
      const rawPaperIdx = mapPalIndex(paperRgb);
      const inkIdx = rawInkIdx<8 ? rawInkIdx : rawInkIdx-7;
      const paperIdx = rawPaperIdx<8 ? rawPaperIdx : rawPaperIdx-7;
      const attrAddr = 6144 + by*cols + bx;
      scrBytes[attrAddr] = ((bright?1:0)<<6)|((paperIdx&7)<<3)|(inkIdx&7);
    }
  }
  return scrBytes;
}

function newEncodeScr(indexed) {
  const { pixels, attrs, width:W, height:H } = indexed;
  const scrBytes = new Uint8Array(6912);
  scrBytes.fill(0);
  const cols = W>>3, rows=H>>3;
  for (let by=0; by<rows; by++) {
    for (let bx=0; bx<cols; bx++) {
      const attr = attrs[by*cols+bx];
      for (let dy=0; dy<8; dy++) {
        const y=by*8+dy;
        const bankOffset=(y & 0xC0)<<5;
        const rowOffset=(y & 0x38)<<2;
        const lineOffset=(y & 0x07)<<8;
        const baseAddr=bankOffset|rowOffset|lineOffset|bx;
        let byte=0;
        for (let bit=0; bit<8; bit++) {
          const x=bx*8+bit;
          const idx=pixels[y*W + x];
          byte |= (idx===attr.ink?1:0)<<(7-bit);
        }
        scrBytes[baseAddr]=byte;
      }
      const attrAddr=6144+by*cols+bx;
      scrBytes[attrAddr]=((attr.flash?1:0)<<7)|((attr.bright?1:0)<<6)|((attr.paper&7)<<3)|(attr.ink&7);
    }
  }
  return scrBytes;
}

// create simple 16x16 test pattern
const W=16, H=16;
const rgba = new Uint8Array(W*H*4);
function fillBlock(bx,by,cA,cB){
  for(let dy=0; dy<8; dy++){
    for(let dx=0; dx<8; dx++){
      const idx=dx<5?cA:cB;
      const [r,g,b]=ZX_BASE[idx];
      const x=bx*8+dx;
      const y=by*8+dy;
      const p=(y*W+x)*4;
      rgba[p]=r; rgba[p+1]=g; rgba[p+2]=b; rgba[p+3]=255;
    }
  }
}
fillBlock(0,0,0,2);
fillBlock(1,0,1,3);
fillBlock(0,1,4,6);
fillBlock(1,1,5,7);

const indexed = rgbaToIndexed(rgba, W, H, { bright: 0, flash: 0 });
const roundtrip = indexedToRgba(indexed);
assert.deepStrictEqual(Array.from(roundtrip), Array.from(rgba));

const oldScr = oldEncodeScr(rgba, W, H, 0);
const newScr = newEncodeScr(indexed);
assert.deepStrictEqual(Array.from(newScr), Array.from(oldScr));

console.log('Indexed conversion tests passed');
