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
    applyAlpha,
  };
  if (layerID !== undefined) getOpts.layerID = layerID;
  const { imageData } = await imaging.getPixels(getOpts);
  const outW = imageData.width;
  const outH = imageData.height;
  const data = await imageData.getData();
  imageData.dispose();
  const pxCount = outW * outH;
  const rgba = convertTo8BitRgba(data, pxCount);
  return { rgba, width: outW, height: outH };
}

/**
 * Convert pixel data from imaging API to Uint8 RGBA buffer.
 * Handles 8-bit and 16-bit per channel inputs.
 * @param {Uint8Array|Uint16Array} data
 * @param {number} pxCount
 * @returns {Uint8Array}
 */
function convertTo8BitRgba(data, pxCount) {
  const comps = data.length / pxCount;
  const is16 = data.BYTES_PER_ELEMENT === 2; // 16-bit data contains values in range 0-32767
  const out = new Uint8Array(pxCount * 4);
  for (let i = 0; i < pxCount; i++) {
    const pi = i * comps;
    const po = i * 4;
    out[po]     = is16 ? Math.round(data[pi] * 255 / 32768) : data[pi]; // 8-bit or 16-bit conversion
    // Handle 16-bit values by scaling to 8-bit
    out[po + 1] = is16 ? Math.round(data[pi + 1] * 255 / 32768) : data[pi + 1];
    out[po + 2] = is16 ? Math.round(data[pi + 2] * 255 / 32768) : data[pi + 2];
    out[po + 3] = comps === 4 ? (is16 ? data[pi + 3] >> 8 : data[pi + 3]) : 255;
  }
  return out;
}

/**
 * Expand 8-bit RGBA data back to 16-bit representation.
 * Values in 16-bit documents lie in the range 0-32767.
 * @param {Uint8Array} data8
 * @returns {Uint16Array}
 */
function convertTo16BitRgba(data8) {
  const pxCount = data8.length / 4;
  const out = new Uint16Array(data8.length);
  for (let i = 0; i < pxCount; i++) {
    const pi = i * 4;
    out[pi]     = Math.round(data8[pi]     * 32768 / 255);
    out[pi + 1] = Math.round(data8[pi + 1] * 32768 / 255);
    out[pi + 2] = Math.round(data8[pi + 2] * 32768 / 255);
    out[pi + 3] = data8[pi + 3] << 8;
  }
  return out;
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

async function addFlashCorners(layer, doc, imaging, replace = true) {
  const W = Math.round(+doc.width);
  const H = Math.round(+doc.height);
  const bitStr = String(doc.bitsPerChannel);
  const bits = /16/.test(bitStr) ? 16 : 8;
  const buf8 = new Uint8Array(W * H * 4);
  const corners = [
    [0, 0], [W - 1, H - 1]
  ];
  for (const [x, y] of corners) {
    const p = (y * W + x) * 4;
    buf8[p + 3] = 1;
  }
  const buf = bits === 16 ? convertTo16BitRgba(buf8) : buf8;
  const imgData = await imaging.createImageDataFromBuffer(buf, {
    width: W,
    height: H,
    components: 4,
    colorSpace: "RGB",
  });
  await imaging.putPixels({ layerID: layer.id, imageData: imgData, replace });
  imgData.dispose();
}

async function ensureFlashLayer(doc, imaging) {
  const W = Math.round(+doc.width);
  const H = Math.round(+doc.height);
  let layer = findLayerByName(doc.layers, "FLASH");
  if (!layer) {
    layer = await doc.createLayer({ name: "FLASH" });
    await addFlashCorners(layer, doc, imaging, true);
    return layer;
  }

  let rgba = null;
  try {
    const fr = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H, layerID: layer.id }, false);
    rgba = fr.rgba;
  } catch (e) {
    rgba = null;
  }

  let needFix = false;
  if (!rgba || rgba.length < W * H * 4) {
    needFix = true;
  } else {
    const tl = rgba[3];
    const br = rgba[((H - 1) * W + (W - 1)) * 4 + 3];
    if (tl === 0 || br === 0) needFix = true;
  }

  if (needFix) {
    layer.name = "FLASH_OLD";
    const newLayer = await doc.createLayer({ name: "FLASH" });
    await addFlashCorners(newLayer, doc, imaging, true);
    try { await layer.moveAbove(newLayer); } catch (e) {}
    try { await layer.merge(); } catch (e) {}
    layer = newLayer;
  }
  return layer;
}

module.exports = { getRgbaPixels, findLayerByName, ensureFlashLayer, convertTo8BitRgba, convertTo16BitRgba };
