// src/ui/controls.js
const { app, imaging, core } = require("photoshop");
const { getRgbaPixels, ensureFlashLayer } = require("../utils/utils");
const { indexedToRgba } = require("../utils/indexed");

function getDomElements() {
  return {
    btnDown: document.getElementById("scaleDown"),
    btnUp: document.getElementById("scaleUp"),
    lblScale: document.getElementById("scaleLabel"),
    selSys: document.getElementById("sysScaleSel"),
    img: document.getElementById("previewImg"),
    btnApply: document.getElementById("applyBtn"),
    selAlg: document.getElementById("ditherAlgSel"),
    rngStr: document.getElementById("ditherStrength"),
    lblStr: document.getElementById("ditherLabel"),
    brightSel: document.getElementById("brightModeSel"),
    flashChk: document.getElementById("flashChk"),
    saveScrBtn: document.getElementById("saveScrBtn"),
  };
}

function saveSettings(settings) {
  try {
    localStorage.setItem("zx_plugin_settings", JSON.stringify(settings));
  } catch (e) { /* ignore */ }
}

function loadSettings() {
  try {
    const s = localStorage.getItem("zx_plugin_settings");
    return s ? JSON.parse(s) : {};
  } catch (e) { return {}; }
}

function setupControls({
  zxFilter,
  updatePreview,
  getScale,
  setScale,
  getLastDimensions,
  setAlgorithm,
  setDitherStrength,
  setBrightMode,
  setFlashEnabled,
  saveSCR,
}) {
  const {
    btnDown,
    btnUp,
    lblScale,
    selSys,
    img,
    btnApply,
    selAlg,
    rngStr,
    lblStr,
    brightSel,
    flashChk,
    saveScrBtn,
  } = getDomElements();

  // Відновлення налаштувань при старті
  const settings = loadSettings();
  if (settings.scalePreview) {
    setScale(settings.scalePreview);
    lblScale.textContent = settings.scalePreview + "x";
  }
  if (settings.systemScale && selSys) selSys.value = settings.systemScale;
  if (settings.ditherAlg && selAlg) selAlg.value = settings.ditherAlg;
  if (settings.brightMode && brightSel) brightSel.value = settings.brightMode;
  if (typeof settings.flashEnabled === 'boolean' && flashChk) {
    flashChk.checked = settings.flashEnabled;
    setFlashEnabled(flashChk.checked);
  }

  // Синхронізуємо selectedAlg у main.js з UI після відновлення
  if (selAlg) setAlgorithm(selAlg.value);

  // Helper to update scale label and preview
  function updateScaleLabelAndPreview() {
    const scale = getScale();
    lblScale.textContent = scale + "x";
    saveSettings({
      ...loadSettings(),
      scalePreview: scale,
      systemScale: selSys?.value,
      ditherAlg: selAlg?.value,
      brightMode: brightSel?.value,
      flashEnabled: flashChk?.checked
    });
    updatePreview();
  }

  // Algorithm selector
  selAlg?.addEventListener("change", () => {
    setAlgorithm(selAlg.value);
    saveSettings({
      ...loadSettings(),
      ditherAlg: selAlg.value,
      scalePreview: getScale(),
      systemScale: selSys?.value,
      brightMode: brightSel?.value,
      flashEnabled: flashChk?.checked
    });
    updatePreview();
  });

  // Bright mode selector
  brightSel?.addEventListener("change", () => {
    setBrightMode(brightSel.value);
    saveSettings({
      ...loadSettings(),
      brightMode: brightSel.value,
      scalePreview: getScale(),
      systemScale: selSys?.value,
      ditherAlg: selAlg?.value,
      flashEnabled: flashChk?.checked
    });
    updatePreview();
  });

  flashChk?.addEventListener("change", () => {
    setFlashEnabled(flashChk.checked);
    saveSettings({
      ...loadSettings(),
      flashEnabled: flashChk.checked,
      scalePreview: getScale(),
      systemScale: selSys?.value,
      ditherAlg: selAlg?.value,
      brightMode: brightSel?.value
    });
    updatePreview();
  });

  // Save SCR button
  saveScrBtn?.addEventListener("click", () => {
    saveSCR().catch(console.error);
  });

  // Strength slider
  rngStr?.addEventListener("input", () => {
    const v = Number(rngStr.value);
    lblStr.textContent = v + "%";
    setDitherStrength(v / 100);
    updatePreview();
  });

  // Scale Preview controls
  btnDown?.addEventListener("click", () => {
    let s = getScale();
    if (s > 1) setScale(s - 1);
    updateScaleLabelAndPreview();
  });

  btnUp?.addEventListener("click", () => {
    let s = getScale();
    if (s < 4) setScale(s + 1);
    updateScaleLabelAndPreview();
  });

  // system Scale selector
  selSys?.addEventListener("change", () => {
    const { lastW, lastH } = getLastDimensions();
    if (lastW && lastH) {
      const ss = parseFloat(selSys.value) || 1;
      img.style.width = lastW / ss + "px";
      img.style.height = lastH / ss + "px";
    }
    saveSettings({
      ...loadSettings(),
      systemScale: selSys.value,
      scalePreview: getScale(),
      ditherAlg: selAlg?.value,
      brightMode: brightSel?.value,
      flashEnabled: flashChk?.checked
    });
    updatePreview();
  });

  // Apply button
  btnApply?.addEventListener("click", async () => {
    btnApply.disabled = true;
    try {
      await core.executeAsModal(async () => {
        const d = app.activeDocument;
        const W = Math.round(+d.width);
        const H = Math.round(+d.height);
        // Отримуємо RGBA через утиліту
        const { rgba } = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H }, false);
        let flashRgba = null;
        if (flashChk?.checked) {
          const flashLayer = await ensureFlashLayer(d, imaging);
          try {
            const fr = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H, layerID: flashLayer.id }, false);
            flashRgba = fr.rgba;
          } catch (e) {
            console.warn("FLASH layer empty");
          }
        }
        // Застосовуємо фільтр ZX
        const indexed = zxFilter(rgba, W, H, flashRgba);
        const outRgba = indexedToRgba(indexed, false);
        const newData = await imaging.createImageDataFromBuffer(outRgba, {
          width: W,
          height: H,
          components: 4,
          colorSpace: "RGB",
        });
        const lyr = await d.createLayer({ name: "Filtered ZX " + selAlg.value });
        await imaging.putPixels({
          layerID: lyr.id,
          imageData: newData,
          replace: true,
        });
        newData.dispose();
      }, {
        commandName: "Apply ZX Filter",
        historyStateInfo: { name: "Apply ZX Filter", target: app.activeDocument }
      });
    } finally {
      btnApply.disabled = false;
      updatePreview();
    }
  });
}


module.exports = { setupControls, loadSettings };