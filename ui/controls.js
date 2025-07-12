// src/ui/controls.js
const { app, imaging, core } = require("photoshop");
const { getRgbaPixels, ensureFlashLayer } = require("../utils/utils");
const { indexedToRgba } = require("../utils/indexed");

function getDomElements() {
  return {
    btnDown: document.getElementById("scaleDown"),
    btnUp: document.getElementById("scaleUp"),
    lblScale: document.getElementById("scaleLabel"),
    optionsBtn: document.getElementById("optionsBtn"),
    sysMenu: document.getElementById("sysMenu"),
    selSys: document.getElementById("sysScaleSel"),
    img: document.getElementById("previewImg"),
    btnApply: document.getElementById("applyBtn"),
    selGroup: document.getElementById("ditherGroupSel"),
    selAlg: document.getElementById("ditherAlgSel"),
    rngStr: document.getElementById("ditherStrength"),
    lblStr: document.getElementById("ditherLabel"),
    brightBtn: document.getElementById("brightBtn"),
    brightIcon: document.getElementById("brightIcon"),
    flashBtn: document.getElementById("flashBtn"),
    flashIcon: document.getElementById("flashIcon"),
    importBtn: document.getElementById("importBtn"),
    saveScrBtn: document.getElementById("saveScrBtn"),
  };
}

function saveSettings(settings) {
  try {
    localStorage.setItem("zx_plugin_settings", JSON.stringify(settings));
  } catch (e) {}
}

function loadSettings() {
  try {
    const s = localStorage.getItem("zx_plugin_settings");
    return s ? JSON.parse(s) : {};
  } catch (e) { return {}; }
}

const DITHER_GROUPS = {
  ordered: [
    ["checker2x1", "Checkerboard 2x1"],
    ["bayer2", "Bayer 2×2"],
    ["bayer4", "Bayer 4×4"],
    ["bayer", "Bayer 8×8"],
    ["clustered", "Clustered ordered"],
    ["linediag7x7", "Line-diag 7×7"],
  ],
  diffusion: [
    ["fs", "Floyd–Steinberg"],
    ["jjn", "Jarvis–Judice–Ninke"],
    ["sierra3", "Sierra-3"],
    ["stucki", "Stucki"],
    ["burkes", "Burkes"],
    ["atkinson", "Atkinson"],
  ],
  pattern: [
    ["bluenoise", "Blue-noise"],
  ],
};

function setupControls({
  zxFilter,
  updatePreview,
  getScale,
  setScale,
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
    lblScale,
    optionsBtn,
    sysMenu,
    selSys,
    img,
    btnApply,
    selGroup,
    selAlg,
    rngStr,
    lblStr,
    brightBtn,
    brightIcon,
    flashBtn,
    flashIcon,
    importBtn,
    saveScrBtn,
  } = getDomElements();

  const settings = loadSettings();
  if (settings.scalePreview) {
    setScale(settings.scalePreview);
    lblScale.textContent = settings.scalePreview + "x";
  }
  if (settings.systemScale && selSys) selSys.value = settings.systemScale;
  if (settings.ditherGroup && selGroup) selGroup.value = settings.ditherGroup;
  function populate(group) {
    const list = DITHER_GROUPS[group] || [];
    selAlg.innerHTML = "";
    list.forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val; opt.textContent = label; selAlg.appendChild(opt);
    });
  }
  populate(selGroup.value);
  if (settings.ditherAlg && selAlg) selAlg.value = settings.ditherAlg;
  if (settings.brightMode && brightBtn) {
    updateBright(settings.brightMode);
  }
  if (typeof settings.flashEnabled === "boolean" && flashBtn) {
    updateFlash(settings.flashEnabled);
  }

  if (selAlg) setAlgorithm(selAlg.value);

  function updateScaleLabelAndPreview() {
    const scale = getScale();
    lblScale.textContent = scale + "x";
    saveSettings({
      ...loadSettings(),
      scalePreview: scale,
      systemScale: selSys?.value,
      ditherGroup: selGroup?.value,
      ditherAlg: selAlg?.value,
      brightMode: currentBright,
      flashEnabled: flashState,
    });
    updatePreview();
  }

  selGroup?.addEventListener("change", () => {
    populate(selGroup.value);
    setAlgorithm(selAlg.value);
    saveSettings({
      ...loadSettings(),
      ditherGroup: selGroup.value,
      ditherAlg: selAlg.value,
      scalePreview: getScale(),
      systemScale: selSys?.value,
      brightMode: currentBright,
      flashEnabled: flashState,
    });
    updatePreview();
  });

  selAlg?.addEventListener("change", () => {
    setAlgorithm(selAlg.value);
    saveSettings({
      ...loadSettings(),
      ditherAlg: selAlg.value,
      ditherGroup: selGroup?.value,
      scalePreview: getScale(),
      systemScale: selSys?.value,
      brightMode: currentBright,
      flashEnabled: flashState,
    });
    updatePreview();
  });

  let currentBright = settings.brightMode || "on";
  function updateBright(mode) {
    currentBright = mode;
    setBrightMode(mode);
    const map = {
      on: "ui-v2/img/brightness-high-24-outlined.svg",
      off: "ui-v2/img/brightness-low-24-outlined.svg",
      auto: "ui-v2/img/brightness-auto.svg",
    };
    if (brightIcon) brightIcon.src = map[mode];
  }

  brightBtn?.addEventListener("click", () => {
    const order = ["on", "off", "auto"];
    const next = order[(order.indexOf(currentBright) + 1) % order.length];
    updateBright(next);
    saveSettings({
      ...loadSettings(),
      brightMode: next,
      ditherAlg: selAlg?.value,
      ditherGroup: selGroup?.value,
      scalePreview: getScale(),
      systemScale: selSys?.value,
      flashEnabled: flashState,
    });
    updatePreview();
  });

  let flashState = !!settings.flashEnabled;
  function updateFlash(state) {
    flashState = !!state;
    setFlashEnabled(flashState);
    flashIcon.src = flashState ? "ui-v2/img/lightning-24-outlined.svg" : "ui-v2/img/lightning-off-24-outlined.svg";
  }
  flashBtn?.addEventListener("click", () => {
    updateFlash(!flashState);
    saveSettings({
      ...loadSettings(),
      flashEnabled: flashState,
      ditherAlg: selAlg?.value,
      ditherGroup: selGroup?.value,
      scalePreview: getScale(),
      systemScale: selSys?.value,
      brightMode: currentBright,
    });
    updatePreview();
  });

  optionsBtn?.addEventListener("click", () => {
    sysMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!optionsBtn.contains(e.target) && !sysMenu.contains(e.target)) {
      sysMenu.classList.add("hidden");
    }
  });

  importBtn?.addEventListener("click", () => {
    alert("Import not implemented yet");
  });

  saveScrBtn?.addEventListener("click", () => { saveSCR().catch(console.error); });

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
    saveSettings({
      ...loadSettings(),
      systemScale: selSys.value,
      ditherAlg: selAlg?.value,
      ditherGroup: selGroup?.value,
      scalePreview: getScale(),
      brightMode: currentBright,
      flashEnabled: flashState,
    });
    updatePreview();
  });

  btnApply?.addEventListener("click", async () => {
    btnApply.disabled = true;
    try {
      await core.executeAsModal(async () => {
        const d = app.activeDocument;
        const W = Math.round(+d.width);
        const H = Math.round(+d.height);
        const { rgba } = await getRgbaPixels(imaging, { left: 0, top: 0, width: W, height: H }, false);
        let flashRgba = null;
        if (flashState) {
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
        const indexed = zxFilter(rgba, W, H, flashRgba);
        const outRgba = indexedToRgba(indexed, false);
        const newData = await imaging.createImageDataFromBuffer(outRgba, { width: W, height: H, components: 4, colorSpace: "RGB" });
        const lyr = await d.createLayer({ name: "Filtered ZX " + selAlg.value });
        await imaging.putPixels({ layerID: lyr.id, imageData: newData, replace: true });
        newData.dispose();
      }, { commandName: "Apply ZX Filter", historyStateInfo: { name: "Apply ZX Filter", target: app.activeDocument } });
    } finally {
      btnApply.disabled = false;
      updatePreview();
    }
  });
}

module.exports = { setupControls, loadSettings };
