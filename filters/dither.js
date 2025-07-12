

// filters/dither.js
const algMap = require("./algorithms");
// Оновлено шлях до утиліт, якщо потрібно
// const { getRgbaPixels } = require("../utils/utils");

function ditherSeparateChannels(rgba, w, h, algoKey, strengthT) {
  const fn = algMap[algoKey];
  if (typeof fn !== "function") {
    throw new Error(`Unknown dither algorithm: ${algoKey}`);
  }

  // 1) Створюємо три канали
  const size = w * h;
  const chR = new Uint8Array(size);
  const chG = new Uint8Array(size);
  const chB = new Uint8Array(size);

  for (let i = 0; i < size; i++) {
    chR[i] = rgba[i*4];
    chG[i] = rgba[i*4 + 1];
    chB[i] = rgba[i*4 + 2];
  }

  // 2) Застосовуємо алгоритм до кожного каналу
  fn(chR, w, h, strengthT);
  fn(chG, w, h, strengthT);
  fn(chB, w, h, strengthT);

  // 3) Записуємо результат назад у rgba
  for (let i = 0; i < size; i++) {
    rgba[i*4]     = chR[i];
    rgba[i*4 + 1] = chG[i];
    rgba[i*4 + 2] = chB[i];
    // alpha без змін
  }
}

module.exports = { ditherSeparateChannels };
