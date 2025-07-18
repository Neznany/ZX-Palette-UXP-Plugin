// utils/scr.js
// Encoding ZX Spectrum SCR files with tiling support

// relative positions of neighbouring blocks (no diagonals)
const NEIGHBOR_OFFSETS = [
  [-1, 0], [1, 0], [0, -1], [0, 1]
];

// Determine majority fill for uniform blocks using BFS queue
function computeFillBytes(indexed, preferDarkInk = true) {
  const { pixels, attrs, width: W, height: H } = indexed;
  const cols = Math.ceil(W / 8);
  const rows = Math.ceil(H / 8);
  const total = cols * rows;
  const fill = new Uint8Array(total); // 0x00 or 0xFF per block

  const normal = new Set();
  const uniform = new Set();

  // normalize attributes and split blocks into normal/uniform
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const idx = by * cols + bx;
      const attr = attrs[idx];
      if (!attr) continue;
      if (attr.ink !== attr.paper) {
        if ((preferDarkInk && attr.ink > attr.paper) || (!preferDarkInk && attr.ink < attr.paper)) {
          const t = attr.ink; attr.ink = attr.paper; attr.paper = t;
        }
        normal.add(idx);
      } else {
        uniform.add(idx);
      }
    }
  }

  if (!uniform.size) return fill;

  const isDark = _isImageDark(indexed);

  const queued = new Set();
  const processed = new Set();
  const queues = [[], [], [], [], []];

  function inBounds(bx, by) {
    return bx >= 0 && bx < cols && by >= 0 && by < rows;
  }

  function countNormal(idx) {
    const bx = idx % cols; const by = Math.floor(idx / cols);
    let c = 0;
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nbx = bx + dx; const nby = by + dy;
      if (!inBounds(nbx, nby)) continue;
      if (normal.has(nby * cols + nbx)) c++;
    }
    return c;
  }

  function enqueue(idx) {
    if (queued.has(idx) || processed.has(idx) || !uniform.has(idx)) return;
    const c = countNormal(idx);
    if (c > 0) { queues[c].push(idx); queued.add(idx); }
  }

  for (const idx of uniform) enqueue(idx);

  function edgeCounts(idx) {
    const bx = idx % cols; const by = Math.floor(idx / cols);
    let ones = 0, zeros = 0;
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nbx = bx + dx; const nby = by + dy;
      if (!inBounds(nbx, nby)) continue;
      const nIdx = nby * cols + nbx;
      if (!normal.has(nIdx)) continue;
      const nAttr = attrs[nIdx];
      for (let s = 0; s < 8; s++) {
        let x, y;
        if (dx === -1) { x = nbx * 8 + 7; y = by * 8 + s; }
        else if (dx === 1) { x = nbx * 8; y = by * 8 + s; }
        else if (dy === -1) { x = bx * 8 + s; y = nby * 8 + 7; }
        else { x = bx * 8 + s; y = nby * 8; }
        if (x >= W || y >= H) continue;
        const val = pixels[y * W + x];
        if (val === nAttr.ink) ones++; else zeros++;
      }
    }
    return { ones, zeros };
  }

  while (queues.some(q => q.length)) {
    let lvl = 4;
    while (lvl > 0 && queues[lvl].length === 0) lvl--;
    if (lvl === 0) break;
    const idx = queues[lvl].shift();
    queued.delete(idx);
    if (processed.has(idx)) continue;
    const { ones, zeros } = edgeCounts(idx);
    let byte;
    if (ones === zeros) byte = isDark ? 0x00 : 0xFF;
    else byte = ones > zeros ? 0xFF : 0x00;
    fill[idx] = byte;
    normal.add(idx);
    processed.add(idx);
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nbx = (idx % cols) + dx; const nby = Math.floor(idx / cols) + dy;
      if (!inBounds(nbx, nby)) continue;
      enqueue(nby * cols + nbx);
    }
  }

  // any remaining blocks default by overall brightness
  for (const idx of uniform) {
    if (!processed.has(idx)) fill[idx] = isDark ? 0x00 : 0xFF;
  }

  return fill;
}

function encodeTile(indexed, fillMap, tx = 0, ty = 0) {
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

      const fillByte = attr.ink === attr.paper ? fillMap[aIdx] : 0;
      
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

const { optimizeAttributes, _isImageDark } = require('./indexed');

// Split large images into 256x192 tiles encoded as individual .scr buffers
function encodeTiles(indexed, preferDarkInk = false) {
  // tweak attributes globally before tiling (only handle fully uniform case)
  if (indexed.attrs.every(a => a.ink === a.paper)) {
    const paper = indexed.attrs[0].paper & 7;
    const complement = (7 - paper) & 7;
    for (const attr of indexed.attrs) attr.ink = complement;
    indexed.pixels.fill(paper);
  }
  const fillMap = computeFillBytes(indexed, preferDarkInk);
  const tilesX = Math.ceil(indexed.width / 256);
  const tilesY = Math.ceil(indexed.height / 192);
  const tiles = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      tiles.push({ tx, ty, bytes: encodeTile(indexed, fillMap, tx, ty) });
    }
  }
  return tiles;
}

module.exports = { encodeTile, encodeTiles, computeFillBytes };
