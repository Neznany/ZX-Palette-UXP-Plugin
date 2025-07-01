// src/ui/controls.js
const { app, imaging, core } = require("photoshop");

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
  // DOM elements
  const btnDown = document.getElementById("scaleDown");
  const btnUp = document.getElementById("scaleUp");
  const lblScale = document.getElementById("scaleLabel");
  const selSys = document.getElementById("sysScaleSel");
  const img = document.getElementById("previewImg");
  const btnApply = document.getElementById("applyBtn");
  const selAlg = document.getElementById("ditherAlgSel");
  const rngStr = document.getElementById("ditherStrength");
  const lblStr = document.getElementById("ditherLabel");
  const brightSel = document.getElementById("brightModeSel");
  const saveScrBtn = document.getElementById("saveScrBtn");

  // Algorithm selector
  selAlg.onchange = () => {
    setAlgorithm(selAlg.value);
    updatePreview();
  };

  brightSel.onchange = () => {
    setBrightMode(brightSel.value);
    updatePreview();
  };

  saveScrBtn.onclick = () => {
    saveSCR().catch(console.error);
  };

  // Strength slider
  rngStr.oninput = () => {
    const v = Number(rngStr.value);
    lblStr.textContent = v + "%";
    setDitherStrength(v / 100);
    updatePreview();
  };

  // Scale controls
  btnDown.onclick = () => {
    let s = getScale();
    if (s > 1) setScale(s - 1);
    lblScale.textContent = getScale() + "x";
    updatePreview();
  };

  btnUp.onclick = () => {
    let s = getScale();
    if (s < 4) setScale(s + 1);
    lblScale.textContent = getScale() + "x";
    updatePreview();
  };

  selSys.onchange = () => {
    const { lastW, lastH } = getLastDimensions();
    if (lastW && lastH) {
      const ss = parseFloat(selSys.value) || 1;
      img.style.width = lastW / ss + "px";
      img.style.height = lastH / ss + "px";
    }
    updatePreview();
  };

  // Apply button
  btnApply.onclick = async () => {
    btnApply.disabled = true;
    try {
      await core.executeAsModal(async () => {
        const d = app.activeDocument;
        const W = Math.round(+d.width);
        const H = Math.round(+d.height);
        const { imageData: srcData } = await imaging.getPixels({
          sourceBounds: { left: 0, top: 0, width: W, height: H },
          targetSize: { width: W, height: H },
          applyAlpha: false,
        });
        const data = await srcData.getData();
        srcData.dispose();
        let rgba;
        const px = W * H;
        if (data.length === px * 3) {
          rgba = new Uint8Array(px * 4);
          for (let i = 0; i < px; i++) {
            rgba[i * 4] = data[i * 3];
            rgba[i * 4 + 1] = data[i * 3 + 1];
            rgba[i * 4 + 2] = data[i * 3 + 2];
            rgba[i * 4 + 3] = 255;
          }
        } else {
          rgba = data;
        }
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
  };

}

module.exports = { setupControls };
