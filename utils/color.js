/* Convert RGB [0…255] to HSL [h:0…1, s:0…1, l:0…1] */
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  // Hue
  if (d !== 0) {
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6;
    } else {
      h = ((r - g) / d + 4) / 6;
    }
  }
  // Lightness
  const l = (max + min) / 2;
  // Saturation
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
  }
  return [h, s, l];
}

/* Convert HSL [h:0…1, s:0…1, l:0…1] back to RGB [0…255] */
function hslToRgb(h, s, l) {
  let r, g, b;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h;
  const t = [hk + 1 / 3, hk, hk - 1 / 3].map((tc) => {
    if (tc < 0) tc += 1;
    if (tc > 1) tc -= 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * 6 * (2 / 3 - tc);
    return p;
  });
  [r, g, b] = t.map((v) => Math.round(v * 255));
  return [r, g, b];
}

module.exports = { rgbToHsl, hslToRgb };