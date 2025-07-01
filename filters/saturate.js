// saturate.js
const { rgbToHsl, hslToRgb } = require("../utils/color");

function saturate100(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const [h, , l] = rgbToHsl(rgba[i], rgba[i+1], rgba[i+2]);
    const [r2, g2, b2] = hslToRgb(h, 1.0, l);
    rgba[i] = r2;
    rgba[i+1] = g2;
    rgba[i+2] = b2;
  }
}

module.exports = { saturate100 };
