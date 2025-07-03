// src/ui/controls.js
const { app, imaging, core } = require("photoshop");
const { getRgbaPixels } = require("../filters/utils");

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
    saveScrBtn: document.getElementById("saveScrBtn"),
  };
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
    saveScrBtn,
  } = getDomElements();

  // Helper to update scale label and preview
  function updateScaleLabelAndPreview() {
    lblScale.textContent = getScale() + "x";
    updatePreview();
  }

  // Algorithm selector
  selAlg?.addEventListener("change", () => {
    setAlgorithm(selAlg.value);
    updatePreview();
  });

  // Bright mode selector
  brightSel?.addEventListener("change", () => {
    setBrightMode(brightSel.value);
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

  // Scale controls
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

  selSys?.addEventListener("change", () => {
    const { lastW, lastH } = getLastDimensions();
    if (lastW && lastH) {
      const ss = parseFloat(selSys.value) || 1;
      img.style.width = lastW / ss + "px";
      img.style.height = lastH / ss + "px";
    }
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
        zxFilter(rgba, W, H);
        const newData = await imaging.createImageDataFromBuffer(rgba, {
          width: W,
          height: H,
          components: 4,
          colorSpace: "RGB",
        });
        const lyr = await d.createLayer({ name: "Filtered ZX" });
        await imaging.putPixels({
          layerID: lyr.id,
          imageData: newData,
          replace: true,
        });
        newData.dispose();
      }, { commandName: "Apply ZX Filter" });
    } finally {
      btnApply.disabled = false;
      updatePreview();
    }
  });
}

module.exports = { setupControls };
