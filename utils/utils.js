// utils.js — універсальні функції для роботи з пікселями та зображеннями

/**
 * Отримує RGBA-пікселі з документа Photoshop через imaging.getPixels
 * @param {object} imaging - imaging API
 * @param {object} options - { left, top, width, height }
 * @param {boolean} [applyAlpha=false] - чи застосовувати альфу
 * @returns {Promise<{rgba: Uint8Array, width: number, height: number}>}
 */
async function getRgbaPixels(imaging, options, applyAlpha = true) {
  const { left, top, width, height, layerID } = options;
  const getOpts = {
    sourceBounds: { left, top, width, height },
    targetSize: { width, height },
    applyAlpha,
  };
  if (layerID !== undefined) getOpts.layerID = layerID;
  const { imageData } = await imaging.getPixels(getOpts);
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

function findLayerByName(layers, name) {
  for (const layer of layers) {
    if (layer.name === name) return layer;
    if (layer.layers && layer.layers.length) {
      const found = findLayerByName(layer.layers, name);
      if (found) return found;
    }
  }
  return null;
}

async function ensureFlashLayer(doc, imaging) {
  const W = Math.round(+doc.width);
  const H = Math.round(+doc.height);
  let layer = findLayerByName(doc.layers, "FLASH");
  let created = false;
  if (!layer) {
    layer = await doc.createLayer({ name: "FLASH" });
    created = true;
  }
  if (created) {
    const buf = new Uint8Array(W * H * 4);
    const corners = [
      [0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]
    ];
    for (const [x, y] of corners) {
      const p = (y * W + x) * 4;
      buf[p + 3] = 1;
    }
    const imgData = await imaging.createImageDataFromBuffer(buf, {
      width: W,
      height: H,
      components: 4,
      colorSpace: "RGB",
    });
    await imaging.putPixels({ layerID: layer.id, imageData: imgData, replace: true });
    imgData.dispose();
  }
  return layer;
}

module.exports = { getRgbaPixels, findLayerByName, ensureFlashLayer };
