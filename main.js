// main.js (UXP Plugin Entry)
const { app, imaging, core, action } = require("photoshop");
const { setupControls, loadSettings } = require("./ui/controls");
const { reduceToDominantPair } = require("./filters/reduce");
const { ditherSeparateChannels } = require("./filters/dither");
const { rgbaToIndexed, indexedToRgba, computeBrightAttrs, rgbToIndex, applyFlashAttrs } = require("./utils/indexed");
const { encodeTiles, decodeScr } = require("./utils/scr");
const { storage } = require("uxp");
const fs = storage.localFileSystem;
const formats = storage.formats;
const { getRgbaPixels, ensureFlashLayer, convertTo16BitRgba } = require("./utils/utils");

// DOM elements
const img = document.getElementById("previewImg");
const msg = document.getElementById("invalidMsg");
const btnDown = document.getElementById("zoomDown");
const btnUp = document.getElementById("zoomUp");
const lblZoom = document.getElementById("zoomLabel");
const selSys = document.getElementById("sysScaleSel");
const btnApply = document.getElementById("applyBtn");

// State
let zoom = 3;
let systemScale = (function () {
  const settings = (typeof loadSettings === 'function') ? loadSettings() : {};
  if (settings && settings.systemScale) return parseFloat(settings.systemScale) || 1;
  return 1;
})();
let busy = false;
let lastW = 0,
  lastH = 0;
let invalid = false;
// Initialize selectedAlg from saved settings or fallback to first available
let selectedAlg = (function () {
  const settings = (typeof loadSettings === 'function') ? loadSettings() : {};
  if (settings && settings.ditherAlg) return settings.ditherAlg;
  const sel = document.getElementById("ditherAlgSel");
  if (sel && sel.options && sel.options.length > 0) {
    return sel.options[0].value;
  }
  return "fs"; // fallback to Floyd-Steinberg
})();
let ditherT = 0.5;

// Initialize brightMode from saved settings or default to "on"
let brightMode = (function () {
  const settings = (typeof loadSettings === 'function') ? loadSettings() : {};
  if (settings && settings.brightMode) return settings.brightMode;
  return 'on'; // default to 'on'
})();

let flashEnabled = (function () {
  const settings = (typeof loadSettings === 'function') ? loadSettings() : {};
  return settings && settings.flashEnabled ? true : false;
})();

let flashPhase = false;
let lastDocId = null;
let lastHistory = null;
let lastSettingsKey = "";
let thumbCache = { off: "", on: "", indexed: null, w: 0, h: 0 };
let pixelCache = { rgba: null, flashRgba: null, w: 0, h: 0 };
let lastDocMode = "";
let lastDocBits = "";
let lastDocWidth = 0;
let lastDocHeight = 0;

function clearPreview() {
  img.src = "";
  thumbCache = { off: "", on: "", indexed: null, w: 0, h: 0 };
  pixelCache = { rgba: null, flashRgba: null, w: 0, h: 0 };
}

// Track slider interaction state
let sliderDragging = false;
let sliderReleasedAt = 0;
let sliderDragPending = false;
let sliderRAF = 0;

function startSliderLoop() {
  if (!sliderRAF) sliderRAF = window.requestAnimationFrame(sliderLoop);
}

async function sliderLoop() {
  sliderRAF = 0;
  if (sliderDragPending && !updatePreview._running) {
    sliderDragPending = false;
    await updatePreview(true);
  }
  if (sliderDragging || sliderDragPending) startSliderLoop();
}

function setSliderDragging(v) {
  sliderDragging = !!v;
  if (!v) sliderReleasedAt = Date.now();
  startSliderLoop();
}

function notifySliderChange() {
  sliderDragPending = true;
  startSliderLoop();
}

function isSliderLocked() {
  return sliderDragging || Date.now() - sliderReleasedAt < 500;
}

function getZoom() {
  return zoom;
}
function setZoom(v) {
  zoom = v;
}

function getSystemScale() {
  return systemScale;
}

function setSystemScale(v) {
  systemScale = v;
}
function getLastDimensions() {
  return { lastW, lastH };
}
function setAlgorithm(v) {
  selectedAlg = v;
}
function setDitherStrength(t) {
  ditherT = t;
}
function setBrightMode(v) {
  brightMode = v;
}

function setFlashEnabled(v) {
  flashEnabled = !!v;
}


// Core filter: performs dithering + palette reduction and returns indexed frame
function zxFilter(rgba, w, h, flashRgba = null) {
  // compute per-block brightness if auto mode is enabled
  let brightBits;
  if (brightMode === "auto") {
    const orig = new Uint8Array(rgba);
    brightBits = computeBrightAttrs(orig, w, h);
  }

  // 1) dithering in RGB space
  ditherSeparateChannels(rgba, w, h, selectedAlg, ditherT);

  // 2) reduce each 8x8 block to the two closest ZX colors
  reduceToDominantPair(rgba, w, h);

  // 3) convert to indexed attributes/pixels
  const bright = brightMode === "on" ? 1 : 0;
  const indexed = rgbaToIndexed(rgba, w, h, { bright, flash: 0, brightBits });

  // 4) integrate FLASH layer if present
  if (flashEnabled && flashRgba) applyFlashAttrs(indexed, flashRgba, w, h);
  return indexed;
}

async function renderFromPixels() {
  const { rgba, flashRgba, w, h } = pixelCache;
  if (!rgba) return null;

  const base = new Uint8Array(rgba);
  const flash = flashRgba ? new Uint8Array(flashRgba) : null;
  const indexed = zxFilter(base, w, h, flash);
  const rgbaOff = indexedToRgba(indexed, false);
  const rgbaOn = flashEnabled ? indexedToRgba(indexed, true) : rgbaOff;

  const s = 4;
  const w2 = w * s;
  const h2 = h * s;

  async function encode(buf) {
    const outBuf = new Uint8Array(w2 * h2 * 3);
    for (let y = 0; y < h2; y++) {
      const srcY = Math.floor(y / s);
      for (let x = 0; x < w2; x++) {
        const srcX = Math.floor(x / s);
        const i4 = (srcY * w + srcX) * 4;
        const i3 = (y * w2 + x) * 3;
        outBuf[i3] = buf[i4];
        outBuf[i3 + 1] = buf[i4 + 1];
        outBuf[i3 + 2] = buf[i4 + 2];
      }
    }
    const imgData = await imaging.createImageDataFromBuffer(outBuf, {
      width: w2, height: h2, components: 3, colorSpace: "RGB",
    });
    const b64 = await imaging.encodeImageData({
      imageData: imgData,
      base64: true,
      format: "jpg",
      quality: 1.0,
    });
    imgData.dispose();
    return b64;
  }

  const off = await encode(rgbaOff);
  const on = await encode(rgbaOn);

  return { indexed, off, on, w: w2, h: h2 };
}

async function fetchThumb() {
  const d = app.activeDocument;
  if (!d) return null;
  if (core.isModal && typeof core.isModal === "function" && core.isModal()) {
    return null;
  }
  try {
    return await core.executeAsModal(async () => {
      const baseW = Math.round(+d.width);
      const baseH = Math.round(+d.height);

      // 1) Отримуємо RGBA-пікселі через утиліту
      const { rgba } = await getRgbaPixels(imaging, { left: 0, top: 0, width: baseW, height: baseH }, false);

      let flashRgba = null;
      if (flashEnabled) {
        let flashLayer = await ensureFlashLayer(d, imaging);
        try {
          const fr = await getRgbaPixels(imaging, { left: 0, top: 0, width: baseW, height: baseH, layerID: flashLayer.id }, false);
          flashRgba = fr.rgba;
          if (flashRgba.length < baseW * baseH * 4) {
            flashLayer = await ensureFlashLayer(d, imaging);
            const fr2 = await getRgbaPixels(imaging, { left: 0, top: 0, width: baseW, height: baseH, layerID: flashLayer.id }, false);
            flashRgba = fr2.rgba;
          }
        } catch (e) {
          await ensureFlashLayer(d, imaging);
          console.warn("FLASH layer empty");
        }
      }

      pixelCache = {
        rgba: new Uint8Array(rgba),
        flashRgba: flashRgba ? new Uint8Array(flashRgba) : null,
        w: baseW,
        h: baseH,
      };

      return await renderFromPixels();
    }, { commandName: "ZX Filter: Fetch Preview Thumb" });
  } catch (err) {
    if (err && err.message && /modal/i.test(err.message)) {
      return null;
    }
    throw err;
  }
}

async function updatePreview(cacheOnly = false) {
  if (core.isModal && typeof core.isModal === "function" && core.isModal()) {
    setTimeout(() => updatePreview(cacheOnly), 250);
    return;
  }
  if (!cacheOnly && isSliderLocked()) {
    setTimeout(() => updatePreview(cacheOnly), 100);
    return;
  }
  if (updatePreview._running || busy) {
    if (updatePreview._pending !== false) {
      updatePreview._pending = cacheOnly;
    }
    return;
  }
  updatePreview._pending = null;
  updatePreview._running = true;
  try {
    if (cacheOnly) {
      const thumb = await renderFromPixels();
      if (thumb) {
        thumbCache = { off: thumb.off, on: thumb.on, indexed: thumb.indexed, w: thumb.w, h: thumb.h };
        lastW = thumb.w;
        lastH = thumb.h;
      }
    } else {
      const d = app.activeDocument;
      if (!d) {
        clearPreview();
        return;
      }
      const docW = Math.round(+d.width),
            docH = Math.round(+d.height);
      const modeStr = String(d.mode || "").toLowerCase();
      const bitStr = String(d.bitsPerChannel);
      const bits = /16/.test(bitStr) ? 16 : 8;

      invalid = docW % 8 ||
        docH % 8 ||
        docW > 512 ||
        docH > 384 ||
        !/(8|16)/.test(bitStr) || // supports 8-bit and 16-bit
        !/rgb/.test(modeStr);

      const formatChanged =
        modeStr !== lastDocMode || bits !== lastDocBits ||
        docW !== lastDocWidth || docH !== lastDocHeight;

      if (invalid) {
        if (msg) msg.classList.remove("hidden");
        clearPreview();
        lastDocMode = modeStr;
        lastDocBits = bits;
        lastDocWidth = docW;
        lastDocHeight = docH;
        return;
      } else {
        if (msg) msg.classList.add("hidden");
      }

      const docId = d.id;
      const histId = d.activeHistoryState ? d.activeHistoryState.id : null;
      const settingsKey = JSON.stringify({ selectedAlg, ditherT, brightMode, flashEnabled });

      let needFetch = false;
      if (docId !== lastDocId) { lastDocId = docId; needFetch = true; }
      if (histId !== lastHistory) { lastHistory = histId; needFetch = true; }
      if (settingsKey !== lastSettingsKey) { lastSettingsKey = settingsKey; needFetch = true; }
      if (formatChanged) { needFetch = true; }

      if (needFetch) {
        const thumb = await fetchThumb();
        if (!thumb) {
          if (core.isModal && typeof core.isModal === "function" && core.isModal()) {
            setTimeout(updatePreview, 250);
          }
          return;
        }
        thumbCache = { off: thumb.off, on: thumb.on, indexed: thumb.indexed, w: thumb.w, h: thumb.h };
        lastW = thumb.w;
        lastH = thumb.h;
      }
      lastDocMode = modeStr;
      lastDocBits = bits;
      lastDocWidth = docW;
      lastDocHeight = docH;
    }
    const srcB64 = flashPhase && flashEnabled ? thumbCache.on : thumbCache.off;
    const sysScale = getSystemScale();
    const s = getZoom();
    img.style.width = (thumbCache.w * s / 4) / sysScale + "px";
    img.style.height = (thumbCache.h * s / 4) / sysScale + "px";
    if (srcB64) img.src = "data:image/jpeg;base64," + srcB64;

  } catch (e) {
    console.error(e);
    if (e && e.message && /modal/i.test(e.message)) {
      setTimeout(updatePreview, 250);
    }
  } finally {
    updatePreview._running = false;
    if (updatePreview._pending !== null) {
      const pending = updatePreview._pending;
      updatePreview._pending = null;
      updatePreview(pending);
    }
  }
}

async function saveSCR() {
  let indexed, W, H;

  await core.executeAsModal(
    async () => {
      const doc = app.activeDocument;
      W = Math.round(+doc.width);
      H = Math.round(+doc.height);

      // Отримуємо RGBA-пікселі через утиліту
      const { rgba } = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H }, false);
      let flashRgba = null;
      if (flashEnabled) {
        let flashLayer = await ensureFlashLayer(doc, imaging);
        try {
          const fr = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H, layerID: flashLayer.id }, false);
          flashRgba = fr.rgba;
          if (flashRgba.length < W * H * 4) {
            flashLayer = await ensureFlashLayer(doc, imaging);
            const fr2 = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H, layerID: flashLayer.id }, false);
            flashRgba = fr2.rgba;
          }
        } catch (e) {
          await ensureFlashLayer(doc, imaging);
          console.warn("FLASH layer empty");
        }
      }
      indexed = zxFilter(rgba, W, H, flashRgba);
    },
    { commandName: "Fetch & Filter Pixels" }
  );

  const tiles = encodeTiles(indexed);

  // Отримуємо ім'я активного документа без розширення
  let docName = app.activeDocument && app.activeDocument.title ? app.activeDocument.title : "export";
  docName = docName.replace(/\.[^/.]+$/, ""); // видаляємо розширення

  if (tiles.length === 1) {
    const file = await fs.getFileForSaving(`${docName}.scr`);
    if (!file) return;
    await file.write(tiles[0].bytes.buffer, { format: formats.binary });
  } else {
    const folder = await fs.getFolder();
    if (!folder) return;
    const existing = new Set((await folder.getEntries()).map(e => e.name));
    for (const t of tiles) {
      const base = `${docName}_${t.tx}_${t.ty}`;
      let name = `${base}.scr`;
      let n = 1;
      while (existing.has(name)) {
        name = `${base}__${n}.scr`;
        n++;
      }
      existing.add(name);
      const file = await folder.createFile(name, { overwrite: false });
      await file.write(t.bytes.buffer, { format: formats.binary });
    }
  }
}

async function importSCR() {
  const file = await fs.getFileForOpening({ types: ['scr'] });
  if (!file) return;
  const name = file.name || 'import.scr';
  const buf = await file.read({ format: formats.binary });
  const bytes = new Uint8Array(buf);
  if (bytes.length !== 6912) {
    console.error('Invalid .scr file');
    return;
  }
  const indexed = decodeScr(bytes);
  const rgba8 = indexedToRgba(indexed, false);
  await core.executeAsModal(async () => {
    let doc = app.activeDocument;
    if (!doc) {
      doc = await app.createDocument({ width: indexed.width, height: indexed.height, mode: 'RGBColorMode', fill: 'transparent' });
    } else if (Math.round(+doc.width) !== indexed.width || Math.round(+doc.height) !== indexed.height) {
      alert('Document size must be 256x192 to import .scr');
      return;
    }
    const bitStr = String(doc.bitsPerChannel);
    const bits = /16/.test(bitStr) ? 16 : 8;
    const bufOut = bits === 16 ? convertTo16BitRgba(rgba8) : rgba8;
    const imgData = await imaging.createImageDataFromBuffer(bufOut, {
      width: indexed.width,
      height: indexed.height,
      components: 4,
      colorSpace: 'RGB',
      componentSize: bits,
    });
    const layer = await doc.createLayer({ name });
    await imaging.putPixels({ layerID: layer.id, imageData: imgData, replace: true });
    imgData.dispose();
  }, { commandName: 'Import SCR' });
  updatePreview();
}

// Listen for Photoshop script actions
action.addNotificationListener(["make", "set", "delete", "open", "close"], () =>
  window.requestAnimationFrame(updatePreview)
);

// Ensure DOM is ready before binding UI
document.addEventListener("DOMContentLoaded", () => {

  setupControls({
    zxFilter,
    updatePreview,
    getZoom,
    setZoom,
    getSystemScale,
    setSystemScale,
    getLastDimensions,
    setAlgorithm,
    setDitherStrength,
    setSliderDragging,
    notifySliderChange,
    setBrightMode,
  setFlashEnabled,
  saveSCR, // ← функція експорту
  importSCR,
  });

  // Tooltip handling: show after 1s, hide 0.5s after leave
  // If cursor returns within 0.5s, show immediately
  document.querySelectorAll('.tooltip').forEach(btn => {
    const tip = btn.querySelector('sp-tooltip') || btn.parentElement?.querySelector('sp-tooltip');
    if (!tip) return;
    tip.removeAttribute('open');
    let showT, hideT;
    const cancel = () => {
      clearTimeout(showT);
      clearTimeout(hideT);
      hideT = null;
      tip.removeAttribute('open');
    };
    btn.addEventListener('mouseenter', () => {
      clearTimeout(showT);
      if (hideT && tip.hasAttribute('open')) {
        clearTimeout(hideT);
        hideT = setTimeout(cancel, 5000);
        tip.setAttribute('open', '');
        return;
      }
      clearTimeout(hideT);
      showT = setTimeout(() => {
        tip.setAttribute('open', '');
        hideT = setTimeout(cancel, 5000);
      }, 1000);
    });
    btn.addEventListener('mouseleave', () => {
      clearTimeout(showT);
      if (tip.hasAttribute('open')) {
        clearTimeout(hideT);
        hideT = setTimeout(cancel, 500);
      }
    });
    btn.addEventListener('click', cancel);
  });

  // Initial update
  updatePreview();

  // Fallback interval
  setInterval(() => {
    if (flashEnabled) flashPhase = !flashPhase;
    if (!updatePreview._running) updatePreview();
  }, 500);
});
