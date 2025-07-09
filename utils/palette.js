// utils/palette.js
// Universal ZX Spectrum palette helpers

// configurable dim brightness (0..255)
let dimLevel = 192;

/**
 * Change dim color intensity and rebuild palettes.
 * @param {number} level New value from 0..255
 */
function setDimLevel(level) {
  dimLevel = level;
  buildPalettes();
}

/**
 * Get current dim level.
 */
function getDimLevel() {
  return dimLevel;
}

// Base 3-bit palette used for preview (dim colors only)
let ZX_BASE = [];
// Extended palette with dim + bright variants (bright black repeats black)
// objects contain { rgb: [r,g,b], bright: boolean }
let ZX_FULL = [];
// Palette with 0/255 values used by reduce step
const ZX_BASE_255 = [
  [0, 0, 0],
  [0, 0, 255],
  [255, 0, 0],
  [255, 0, 255],
  [0, 255, 0],
  [0, 255, 255],
  [255, 255, 0],
  [255, 255, 255],
];

function buildPalettes() {
  ZX_BASE = [
    [0, 0, 0],
    [0, 0, dimLevel],
    [dimLevel, 0, 0],
    [dimLevel, 0, dimLevel],
    [0, dimLevel, 0],
    [0, dimLevel, dimLevel],
    [dimLevel, dimLevel, 0],
    [dimLevel, dimLevel, dimLevel],
  ];
  ZX_FULL = [];
  // push dim colors
  for (let i = 0; i < 8; i++) {
    ZX_FULL.push({ rgb: ZX_BASE[i], bright: false });
  }
  // push bright variants (black repeats)
  for (let i = 0; i < 8; i++) {
    const rgb = i === 0 ? [0, 0, 0] : ZX_BASE[i].map(v => (v === 0 ? 0 : 255));
    ZX_FULL.push({ rgb, bright: true });
  }
}

// build palettes once with default dim level
buildPalettes();

module.exports = {
  ZX_BASE,
  ZX_FULL,
  ZX_BASE_255,
  setDimLevel,
  getDimLevel,
};
