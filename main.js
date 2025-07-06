// main.js (UXP Plugin Entry)
const { app, imaging, core, action } = require("photoshop");
const { setupControls, loadSettings } = require("./ui/controls");
const { reduceToDominantPair } = require("./filters/reduce");
const { saturate100 } = require("./filters/saturate");
const { ditherSeparateChannels } = require("./filters/dither");
const { rgbaToIndexed, indexedToRgba } = require("./utils/indexed");
const { storage } = require("uxp");
const fs = storage.localFileSystem;
const formats = storage.formats;
const { getRgbaPixels } = require("./utils/utils");

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
let selectedAlg = (function() {
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
let brightMode = (function() {
  const settings = (typeof loadSettings === 'function') ? loadSettings() : {};
  if (settings && settings.brightMode) return settings.brightMode;
  return 'on';
})();

// ZX Spectrum “Primary” palette (8 base + bright variants)
const ZX_BASE = [
  [0, 0, 0],
  [0, 0, 192],
  [192, 0, 0],
  [192, 0, 192],
  [0, 192, 0],
  [0, 192, 192],
  [192, 192, 0],
  [192, 192, 192],
];
const ZX_PALETTE = [];
for (let i = 0; i < 8; i++) {
  ZX_PALETTE.push({ rgb: ZX_BASE[i], bright: false });
}
for (let i = 1; i < 8; i++) {
  // skip black bright
  const [r, g, b] = ZX_BASE[i].map((v) => (v === 0 ? 0 : 255));
  ZX_PALETTE.push({ rgb: [r, g, b], bright: true });
}

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

// Core filter
function zxFilter(rgba, w, h) {
  ditherSeparateChannels(rgba, w, h, selectedAlg, ditherT);
  reduceToDominantPair(rgba, w, h);
  const bright = brightMode === "on" ? 1 : 0;
  return rgbaToIndexed(rgba, w, h, { bright, flash: 0 });
}

async function fetchThumb() {
  return await core.executeAsModal(async () => {
    const d = app.activeDocument;
    const baseW = Math.round(+d.width);
    const baseH = Math.round(+d.height);

    // 1) Отримуємо RGBA-пікселі через утиліту
    const { rgba } = await getRgbaPixels(imaging, { left: 0, top: 0, width: baseW, height: baseH }, false);

    // 2) Фільтруємо та отримуємо індексований буфер
    const indexed = zxFilter(rgba, baseW, baseH);
    const rgbaFiltered = indexedToRgba(indexed);

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
      indexed = zxFilter(rgba, W, H);
    },
    { commandName: "Fetch & Filter Pixels" }
  );

  const scrBytes  = new Uint8Array(6912);
  scrBytes.fill(0);
  const cols = W >> 3, rows = H >> 3;

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const attr = indexed.attrs[by*cols + bx];

      // bitplane
      for (let dy = 0; dy < 8; dy++) {
        const y = by*8 + dy;
        const bankOffset = (y & 0xC0) << 5;
        const rowOffset  = (y & 0x38) << 2;
        const lineOffset = (y & 0x07) << 8;
        const baseAddr   = bankOffset | rowOffset | lineOffset | bx;
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx*8 + bit;
          const idx = indexed.pixels[y*W + x];
          byte |= (idx === attr.ink ? 1 : 0) << (7 - bit);
        }
        scrBytes[baseAddr] = byte;
      }

      // attribute
      const attrAddr = 6144 + by*cols + bx;
      scrBytes[attrAddr] = ((attr.flash?1:0)<<7)|((attr.bright?1:0)<<6)|((attr.paper&7)<<3)|(attr.ink&7);
    }
  }

  // Отримуємо ім'я активного документа без розширення
  let docName = app.activeDocument && app.activeDocument.title ? app.activeDocument.title : "export";
  docName = docName.replace(/\.[^/.]+$/, ""); // видаляємо розширення
  const file = await fs.getFileForSaving(`${docName}.scr`);
  if (!file) return;
  await file.write(scrBytes.buffer, { format: formats.binary });
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
    setBrightMode, // ← новий сеттер
    saveSCR, // ← функція експорту
  });

  // Initial update
  updatePreview();

  // Fallback interval
  setInterval(() => {
    if (!updatePreview._running) updatePreview();
  }, 500);
});
