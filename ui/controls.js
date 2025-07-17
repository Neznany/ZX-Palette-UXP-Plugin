// src/ui/controls.js
const { app, imaging, core } = require("photoshop");
const { getRgbaPixels, ensureFlashLayer } = require("../utils/utils");
const { indexedToRgba } = require("../utils/indexed");

function getDomElements() {
  return {
    btnDown: document.getElementById("zoomDown"),
    btnUp: document.getElementById("zoomUp"),
    lblZoom: document.getElementById("zoomLabel"),
    selSys: document.getElementById("sysScaleSel"),
    img: document.getElementById("previewImg"),
    btnApply: document.getElementById("applyBtn"),
    selAlg: document.getElementById("ditherAlgSel"),
    rngStr: document.getElementById("ditherStrength"),
    lblStr: document.getElementById("ditherLabel"),
    brightSel: document.getElementById("brightModeSel"),
    flashChk: document.getElementById("flashChk"),
    saveScrBtn: document.getElementById("saveScrBtn"),
    // Preferences dialog elements
    btnPrefs: document.getElementById("openPrefs"),
    prefsDialog: document.getElementById("prefsDialog"),
    pickerDialog: document.getElementById("scalePicker"),
    customField: document.getElementById("customField"),
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
  saveSCR,
}) {
  const {
    btnDown,
    btnUp,
    lblZoom,
    selSys,
    img,
    btnApply,
    selAlg,
    rngStr,
    lblStr,
    brightSel,
    flashChk,
    saveScrBtn,
    // Preferences dialog elements
    btnPrefs,
    prefsDialog,
    pickerDialog,
    customField,
  } = getDomElements();

  // Відновлення налаштувань при старті
  const settings = loadSettings();
  const previewZoom = settings.zoomPreview || settings.scalePreview;
  if (previewZoom) {
    setZoom(previewZoom);
    lblZoom.textContent = previewZoom + "x";
  }
  if (settings.systemScale) {
    setSystemScale(parseFloat(settings.systemScale) || 1);
    if (selSys) selSys.value = settings.systemScale;
  }
  if (settings.ditherAlg && selAlg) selAlg.value = settings.ditherAlg;
  if (settings.brightMode && brightSel) brightSel.value = settings.brightMode;
  if (typeof settings.flashEnabled === 'boolean' && flashChk) {
    flashChk.checked = settings.flashEnabled;
    setFlashEnabled(flashChk.checked);
  }

  // Синхронізуємо selectedAlg у main.js з UI після відновлення
  if (selAlg) setAlgorithm(selAlg.value);

  // Helper to update zoom label and preview
  function updateZoomLabelAndPreview() {
    const zoom = getZoom();
    lblZoom.textContent = zoom + "x";
    saveSettings({
      ...loadSettings(),
      zoomPreview: zoom,
      systemScale: getSystemScale(),
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
      zoomPreview: getZoom(),
      systemScale: getSystemScale(),
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
      zoomPreview: getZoom(),
      systemScale: getSystemScale(),
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
      zoomPreview: getZoom(),
      systemScale: getSystemScale(),
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
    setSliderDragging(true);
    notifySliderChange();
  });
  rngStr?.addEventListener("change", () => {
    setSliderDragging(false);
    notifySliderChange();
    setTimeout(() => updatePreview(), 500);
  });

  // Preview Zoom controls
  btnDown?.addEventListener("click", () => {
    let s = getZoom();
    if (s > 1) setZoom(s - 1);
    updateZoomLabelAndPreview();
  });

  btnUp?.addEventListener("click", () => {
    let s = getZoom();
    if (s < 4) setZoom(s + 1);
    updateZoomLabelAndPreview();
  });

  // system Scale selector
  selSys?.addEventListener("change", () => {
    const { lastW, lastH } = getLastDimensions();
    if (lastW && lastH) {
      const ss = parseFloat(selSys.value) || 1;
      img.style.width = lastW / ss + "px";
      img.style.height = lastH / ss + "px";
    }
    setSystemScale(parseFloat(selSys.value) || 1);
    saveSettings({
      ...loadSettings(),
      systemScale: getSystemScale(),
      zoomPreview: getZoom(),
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
          let flashLayer = await ensureFlashLayer(d, imaging);
          try {
            const fr = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H, layerID: flashLayer.id }, false);
            flashRgba = fr.rgba;
            if (flashRgba.length < W * H * 4) {
              flashLayer = await ensureFlashLayer(d, imaging);
              const fr2 = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H, layerID: flashLayer.id }, false);
              flashRgba = fr2.rgba;
            }
          } catch (e) {
            await ensureFlashLayer(d, imaging);
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

  // Preferences dialog handling
  let prevScale = 1;
  btnPrefs?.addEventListener("click", () => {
    if (!prefsDialog?.show) {
      alert("Preferences dialog not supported in this host.");
      return;
    }
    prevScale = getSystemScale();
    if (pickerDialog) {
      const raw = prevScale * 100;
      const current = parseFloat(raw.toFixed(1)) || 100;
      const presetVals = [100, 125, 150, 175, 200, 225, 250];
      const match = presetVals.find(p => Math.abs(p - raw) < 0.01);
      const target = match ? String(match) : "custom";
      pickerDialog.querySelectorAll("sp-menu-item").forEach((i) => i.removeAttribute("selected"));
      const item = pickerDialog.querySelector(`sp-menu-item[value="${target}"]`);
      if (item) item.setAttribute("selected", "");
      pickerDialog.value = target;
      customField.value = current.toFixed(1);
      if (target === "custom") {
        customField.disabled = false;
        customField.style.display = "";
        validateCustom();
      } else {
        customField.disabled = true;
        customField.style.display = "none";
      }
      pickerDialog.dispatchEvent(new Event('change'));
    }
    prefsDialog.show();
  });

  prefsDialog?.addEventListener('close', () => {
    const result = prefsDialog.returnValue;
    if (result === 'ok') {
      let value = pickerDialog.value;
      if (value === 'custom') {
        let num = parseFloat(customField.value);
        if (Number.isNaN(num)) num = 100;
        if (num < 100) num = 100;
        if (num > 500) num = 500;
        customField.value = String(num);
        value = num;
      }
      const ssVal = Number(value) / 100;
      setSystemScale(ssVal);
      if (selSys) {
        selSys.value = ssVal.toString();
        selSys.dispatchEvent(new Event('change'));

      } else {
        saveSettings({
          ...loadSettings(),
          systemScale: ssVal,
          zoomPreview: getZoom(),
          ditherAlg: selAlg?.value,
          brightMode: brightSel?.value,
          flashEnabled: flashChk?.checked
        });
        updatePreview();
      }
    } else {
      setSystemScale(prevScale);
      if (selSys) {
        selSys.value = String(prevScale);
        selSys.dispatchEvent(new Event('change'));
      } else {
        updatePreview();
      }
    }
  });

  function validateCustom() {
    const num = parseFloat(customField.value);
    const valid = !Number.isNaN(num) && num >= 100 && num <= 500; // Validate custom scale input
    if (!valid) customField.setAttribute('invalid', '');
    else customField.removeAttribute('invalid');
    return valid ? num : null;
  }

  // Enable/disable customField based on picker selection
  const onPickerChange = () => {
    if (pickerDialog.value === 'custom') {
      customField.disabled = false;
      customField.style.display = '';
      customField.focus();
      const val = validateCustom();
      if (val !== null) {
        setSystemScale(val / 100);
        updatePreview();
      }
    } else {
      customField.disabled = true;
      customField.style.display = 'none';
      setSystemScale(Number(pickerDialog.value) / 100);
      updatePreview();
    }
  };
  pickerDialog?.addEventListener("change", onPickerChange);
  pickerDialog?.addEventListener("click", onPickerChange);

  customField?.addEventListener('input', () => {
    if (pickerDialog.value !== 'custom') return;
    const val = validateCustom();
    if (val !== null) {
      setSystemScale(val / 100);
      updatePreview();
    }
  });

    // Attach OK/Cancel handlers to the dialog buttons
  if (prefsDialog) {
    const okBtn = prefsDialog.querySelector('sp-button[variant="primary"]');
    const cancelBtn = prefsDialog.querySelector('sp-button[variant="secondary"]');
    okBtn?.addEventListener('click', () => prefsDialog.close('ok'));
    cancelBtn?.addEventListener('click', () => prefsDialog.close('cancel'));
  }
}


module.exports = { setupControls, loadSettings }
