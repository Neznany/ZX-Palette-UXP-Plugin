// main.js (UXP Plugin Entry)
const { app, imaging, core, action } = require("photoshop");
const { setupControls, loadSettings } = require("./ui/controls");
const { reduceToDominantPair } = require("./filters/reduce");
const { ditherSeparateChannels } = require("./filters/dither");
const { rgbaToIndexed, indexedToRgba, computeBrightAttrs, rgbToIndex } = require("./utils/indexed");
const { encodeTiles } = require("./utils/scr");
const { storage } = require("uxp");
const fs = storage.localFileSystem;
const formats = storage.formats;
const { getRgbaPixels, ensureFlashLayer } = require("./utils/utils");

// DOM elements
const img = document.getElementById("previewImg");
const msg = document.getElementById("msg8");
const btnDown = document.getElementById("scaleDown");
const btnUp = document.getElementById("scaleUp");
const lblScale = document.getElementById("scaleLabel");
const selSys = document.getElementById("sysScaleSel");
const btnApply = document.getElementById("applyBtn");

// State
let scale = 3;
let busy = false;
let prevB64 = "";
let lastW = 0,
  lastH = 0;
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

function getScale() {
  return scale;
}
function setScale(v) {
  scale = v;
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

function applyFlashAttrs(indexed, flashRgba, w, h) {
  const cols = w >> 3;
  const rows = h >> 3;
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const attr = indexed.attrs[by * cols + bx];
      let flagged = false;
      const freq = new Array(8).fill(0);
      for (let dy = 0; dy < 8; dy++) {
        const y = by * 8 + dy;
        for (let dx = 0; dx < 8; dx++) {
          const x = bx * 8 + dx;
          const p = (y * w + x) * 4;
          const a = flashRgba[p + 3];
          if (a > 127) {
            flagged = true;
            if (attr.ink === attr.paper) {
              const idx = rgbToIndex(flashRgba[p], flashRgba[p + 1], flashRgba[p + 2]);
              freq[idx]++;
            }
          }
        }
      }
      if (flagged) {
        attr.flash = 1;
        if (attr.ink === attr.paper) {
          let best = 0, bestC = -1;
          for (let i = 0; i < 8; i++) if (freq[i] > bestC) { bestC = freq[i]; best = i; }
          attr.ink = best;
        }
      }
    }
  }
}

// Core filter
function zxFilter(rgba, w, h, flashRgba = null) {
  let brightBits;
  if (brightMode === "auto") {
    const orig = new Uint8Array(rgba);
    brightBits = computeBrightAttrs(orig, w, h);
  }
  ditherSeparateChannels(rgba, w, h, selectedAlg, ditherT);
  reduceToDominantPair(rgba, w, h);
  const bright = brightMode === "on" ? 1 : 0;
  const indexed = rgbaToIndexed(rgba, w, h, { bright, flash: 0, brightBits });
  if (flashEnabled && flashRgba) applyFlashAttrs(indexed, flashRgba, w, h);
  return indexed;
}

async function fetchThumb() {
  const d = app.activeDocument;
  if (!d) return null;
  // If the host is already in a modal state (e.g. a dialog is open)
  // skip fetching the preview to avoid errors
  if (core.isModal && typeof core.isModal === "function" && core.isModal()) {
    return null;
  }
  return await core.executeAsModal(async () => {
    const baseW = Math.round(+d.width);
    const baseH = Math.round(+d.height);

    // 1) Отримуємо RGBA-пікселі через утиліту
    const { rgba } = await getRgbaPixels(imaging, { left: 0, top: 0, width: baseW, height: baseH }, false);

    let flashRgba = null;
    if (flashEnabled) {
      const flashLayer = await ensureFlashLayer(d, imaging);
      try {
        const fr = await getRgbaPixels(imaging, { left: 0, top: 0, width: baseW, height: baseH, layerID: flashLayer.id }, false);
        flashRgba = fr.rgba;
      } catch (e) {
        console.warn("FLASH layer empty");
      }
    }

    // 2) Фільтруємо та отримуємо індексований буфер
    const indexed = zxFilter(rgba, baseW, baseH, flashRgba);
    const rgbaFiltered = indexedToRgba(indexed, flashPhase && flashEnabled);

    // 3) Upscale + JPEG encode (fixed preview always 4×)
    const s = 4;
    const w2 = baseW * s;
    const h2 = baseH * s;
    const outBuf = new Uint8Array(w2 * h2 * 3);
    for (let y = 0; y < h2; y++) {
      const srcY = Math.floor(y / s);
      for (let x = 0; x < w2; x++) {
        const srcX = Math.floor(x / s);
        const i4 = (srcY * baseW + srcX) * 4;
        // беремо з відфільтрованого RGBA
        const i4src = i4;
        const i3 = (y * w2 + x) * 3;
        outBuf[i3] = rgbaFiltered[i4src];
        outBuf[i3 + 1] = rgbaFiltered[i4src + 1];
        outBuf[i3 + 2] = rgbaFiltered[i4src + 2];
      }
    }
    const rgbData = await imaging.createImageDataFromBuffer(outBuf, {
      width: w2, height: h2, components: 3, colorSpace: "RGB",
    });
    const b64 = await imaging.encodeImageData({
      imageData: rgbData,
      base64: true,
      format: "jpg",
      quality: 1.0,
    });
    rgbData.dispose();

    return { b64, w: w2, h: h2 };
  }, { commandName: "ZX Filter: Fetch Preview Thumb" });
}


async function updatePreview() {
  if (updatePreview._running || busy) return;
  updatePreview._running = true;
  try {
    const d = app.activeDocument;
    if (!d) {
      msg.classList.remove("hidden");
      img.src = "";
      return;
    }
    const docW = Math.round(+d.width),
      docH = Math.round(+d.height);

    // Use cached DOM references
    if (docW % 8 || docH % 8 || docW > 512 || docH > 384) {
      msg.classList.remove("hidden");
      img.src = "";
      return;
    }
    msg.classList.add("hidden");

    const thumb = await fetchThumb();
    if (!thumb) return;

    if (thumb.b64 !== prevB64) {
      prevB64 = thumb.b64;
      lastW = thumb.w;
      lastH = thumb.h;
      img.src = "data:image/jpeg;base64," + thumb.b64;
    }

    const sysScale = parseFloat(selSys.value) || 1;
    const s = getScale();
    img.style.width = (lastW * s / 4) / sysScale + "px";
    img.style.height = (lastH * s / 4) / sysScale + "px";
  } catch (e) {
    console.error(e);
  } finally {
    updatePreview._running = false;
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
        const flashLayer = await ensureFlashLayer(doc, imaging);
        try {
          const fr = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H, layerID: flashLayer.id }, false);
          flashRgba = fr.rgba;
        } catch (e) {
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
    for (const t of tiles) {
      const file = await folder.createFile(`${docName}_${t.tx}_${t.ty}.scr`, { overwrite: true });
      await file.write(t.bytes.buffer, { format: formats.binary });
    }
  }
}


// Listen for Photoshop script actions
action.addNotificationListener(["make", "set", "delete"], () =>
  window.requestAnimationFrame(updatePreview)
);

// Ensure DOM is ready before binding UI
document.addEventListener("DOMContentLoaded", () => {

  setupControls({
    zxFilter,
    updatePreview,
    getScale,
    setScale,
    getLastDimensions,
    setAlgorithm,
    setDitherStrength,
    setBrightMode,
    setFlashEnabled,
    saveSCR, // ← функція експорту
  });

  // Initial update
  updatePreview();

  // Fallback interval
  setInterval(() => {
    if (flashEnabled) flashPhase = !flashPhase;
    if (!updatePreview._running) updatePreview();
  }, 500);
});
