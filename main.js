// main.js (UXP Plugin Entry)
const { app, imaging, core, action } = require("photoshop");
const { setupControls } = require("./ui/controls");
const { reduceToDominantPair } = require("./filters/reduce");
const { saturate100 } = require("./filters/saturate");
const { ditherSeparateChannels } = require("./filters/dither");
const { storage } = require("uxp");
const fs = storage.localFileSystem;
const formats = storage.formats;

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
let selectedAlg = "dot";
let ditherT = 0.5;
let brightMode = "on";

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
  const [r, g, b] = ZX_BASE[i].map(v => v === 0 ? 0 : 255);
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
  saturate100(rgba);
  ditherSeparateChannels(rgba, w, h, selectedAlg, ditherT);
  reduceToDominantPair(rgba, w, h);
}

async function fetchThumb() {
  const d = app.activeDocument;
  const baseW = Math.round(+d.width);
  const baseH = Math.round(+d.height);

  // 1) Отримуємо пікселі (RGB або RGBA)
  const { imageData } = await core.executeAsModal(
    () =>
      imaging.getPixels({
        sourceBounds: { left: 0, top: 0, width: baseW, height: baseH },
        targetSize: { width: baseW, height: baseH },
        applyAlpha: false,
      }),
    { commandName: "GetPixels (base)" }
  );
  const data = await imageData.getData();
  imageData.dispose();

  // 2) Перетворюємо RGB→RGBA, якщо треба
  let rgba;
  const pxCount = baseW * baseH;
  if (data.length === pxCount * 3) {
    rgba = new Uint8Array(pxCount * 4);
    for (let i = 0; i < pxCount; i++) {
      rgba[i * 4] = data[i * 3];
      rgba[i * 4 + 1] = data[i * 3 + 1];
      rgba[i * 4 + 2] = data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else {
    // вже RGBA
    rgba = data;
  }

  // 3) Фільтруємо
  zxFilter(rgba, baseW, baseH);

  // 4) Upscale + JPEG encode (як у вас було)
  const s = scale;
  const w2 = baseW * s;
  const h2 = baseH * s;
  const outBuf = new Uint8Array(w2 * h2 * 3);
  for (let y = 0; y < h2; y++) {
    const srcY = Math.floor(y / s);
    for (let x = 0; x < w2; x++) {
      const srcX = Math.floor(x / s);
      const i4 = (srcY * baseW + srcX) * 4;
      const i3 = (y * w2 + x) * 3;
      outBuf[i3] = rgba[i4];
      outBuf[i3 + 1] = rgba[i4 + 1];
      outBuf[i3 + 2] = rgba[i4 + 2];
    }
  }
  const rgbData = await imaging.createImageDataFromBuffer(outBuf, {
    width: w2, height: h2, components: 3, colorSpace: "RGB",
  });
  const b64 = await imaging.encodeImageData({
    imageData: rgbData,
    base64: true,
    format: "jpg",
    quality: 0.9,
  });
  rgbData.dispose();

  return { b64, w: w2, h: h2 };
}


async function updatePreview() {
  if (updatePreview._running || busy) return;
  updatePreview._running = true;
  try {
    const d = app.activeDocument;
    const docW = Math.round(+d.width),
      docH = Math.round(+d.height);
    const msg = document.getElementById("msg8");
    const img = document.getElementById("previewImg");
    if (docW % 8 || docH % 8 || docW > 512 || docH > 384) {
      msg.classList.remove("hidden");
      img.src = "";
      return;
    }
    msg.classList.add("hidden");

    const thumb = await fetchThumb();
    if (!thumb || thumb.b64 === prevB64) return;
    prevB64 = thumb.b64;
    lastW = thumb.w;
    lastH = thumb.h;

    img.src = "data:image/jpeg;base64," + thumb.b64;
    const sysScale =
      parseFloat(document.getElementById("sysScaleSel").value) || 1;
    img.style.width = lastW / sysScale + "px";
    img.style.height = lastH / sysScale + "px";
  } catch (e) {
    console.error(e);
  } finally {
    updatePreview._running = false;
  }
}

// mapPalIndex: finds nearest index 0…14 in ZX_PALETTE
function mapPalIndex(rgb) {
  let best = 0, bd = Infinity;
  ZX_PALETTE.forEach((p,i) => {
    const dr = p.rgb[0]-rgb[0],
          dg = p.rgb[1]-rgb[1],
          db = p.rgb[2]-rgb[2];
    const d = dr*dr + dg*dg + db*db;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

async function saveSCR() {
  let pixelData, W, H;

  await core.executeAsModal(
    async () => {
      const doc = app.activeDocument;
      W = Math.round(+doc.width);
      H = Math.round(+doc.height);

      const { imageData } = await imaging.getPixels({
        sourceBounds: { left:0, top:0, width:W, height:H },
        targetSize:    { width:W, height:H },
        applyAlpha:    false
      });
      const raw = await imageData.getData();
      imageData.dispose();

      const pxCount = W * H;
      if (raw.length === pxCount * 3) {
        pixelData = new Uint8Array(pxCount * 4);
        for (let i = 0; i < pxCount; i++) {
          pixelData[i*4]   = raw[i*3];
          pixelData[i*4+1] = raw[i*3+1];
          pixelData[i*4+2] = raw[i*3+2];
          pixelData[i*4+3] = 255;
        }
      } else {
        pixelData = raw;
      }

      zxFilter(pixelData, W, H);
    },
    { commandName: "Fetch & Filter Pixels" }
  );

  const scrBytes  = new Uint8Array(6912);
  scrBytes.fill(0);
  const cols = W >> 3, rows = H >> 3;

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      // collect frequencies
      const freq = new Map();
      for (let dy = 0; dy < 8; dy++) {
        const y = by*8 + dy;
        for (let dx = 0; dx < 8; dx++) {
          const x = bx*8 + dx;
          const i4 = (y * W + x) * 4;
          const key = `${pixelData[i4]},${pixelData[i4+1]},${pixelData[i4+2]}`;
          freq.set(key, (freq.get(key)||0) + 1);
        }
      }
      const sorted = [...freq.entries()].sort((a,b)=>b[1]-a[1]);
      const inkKey   = sorted[0][0];
      const paperKey = (sorted[1] || [inkKey])[0];
      const inkRgb   = inkKey.split(",").map(Number);
      const paperRgb = paperKey.split(",").map(Number);

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
          const i4 = (y * W + x) * 4;
          const matchInk = 
            pixelData[i4]   === inkRgb[0] &&
            pixelData[i4+1] === inkRgb[1] &&
            pixelData[i4+2] === inkRgb[2];
          byte |= (matchInk ? 1 : 0) << (7 - bit);
        }
        scrBytes[baseAddr] = byte;
      }

      // attribute
      const rawInkIdx   = mapPalIndex(inkRgb);
      const rawPaperIdx = mapPalIndex(paperRgb);
      const inkIdx   = rawInkIdx   < 8 ? rawInkIdx   : rawInkIdx   - 7;
      const paperIdx = rawPaperIdx < 8 ? rawPaperIdx : rawPaperIdx - 7;
      const bright   = brightMode === "on" ? 1 : 0;
      const attrAddr = 6144 + by*cols + bx;
      scrBytes[attrAddr] = (bright<<6)|(paperIdx<<3)|inkIdx;
    }
  }

  const file = await fs.getFileForSaving("export.scr");
  if (!file) return;
  await file.write(scrBytes.buffer, { format: formats.binary });
}


// Listen for Photoshop script actions
action.addNotificationListener(["make", "set", "delete"], () =>
  window.requestAnimationFrame(updatePreview)
);

// Ensure DOM is ready before binding UI
document.addEventListener("DOMContentLoaded", () => {
  // Get UI elements
  const img = document.getElementById("previewImg");
  const msg = document.getElementById("msg8");

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
