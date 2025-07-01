// preview.js
let previewInterval = null;
function startPreviewLoop() {
  if (!previewInterval) previewInterval = setInterval(updatePreview, 400);
}
function stopPreviewLoop() {
  clearInterval(previewInterval);
  previewInterval = null;
}
module.exports = { startPreviewLoop, stopPreviewLoop };
