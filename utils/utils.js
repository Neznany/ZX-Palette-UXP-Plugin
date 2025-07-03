// utils.js — універсальні функції для роботи з пікселями та зображеннями

/**
 * Отримує RGBA-пікселі з документа Photoshop через imaging.getPixels
 * @param {object} imaging - imaging API
 * @param {object} options - { left, top, width, height }
 * @param {boolean} [applyAlpha=false] - чи застосовувати альфу
 * @returns {Promise<{rgba: Uint8Array, width: number, height: number}>}
 */
async function getRgbaPixels(imaging, options, applyAlpha = true) {
  const { left, top, width, height } = options;
  const { imageData } = await imaging.getPixels({
    sourceBounds: { left, top, width, height },
    targetSize: { width, height },
    applyAlpha,
  });
  const data = await imageData.getData();
  imageData.dispose();
  const pxCount = width * height;
  let rgba;
  if (data.length === pxCount * 3) { // якщо RGB
    // Перетворюємо RGB в RGBA
    rgba = new Uint8Array(pxCount * 4);
    for (let i = 0; i < pxCount; i++) {
      rgba[i * 4] = data[i * 3];
      rgba[i * 4 + 1] = data[i * 3 + 1];
      rgba[i * 4 + 2] = data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else {
    rgba = data;
  }
  return { rgba, width, height };
}

module.exports = { getRgbaPixels };
