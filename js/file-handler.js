import { state } from './state.js';
import { el } from './dom.js';
import { setHint, isMobile, setSolutionState, disableOutputBtns } from './ui-manager.js';
import { showToast } from './utils.js';
import { clearSelection } from './selection.js';

export function handleFile(file) {
  const ok = ["image/jpeg", "image/png", "application/pdf"];
  if (!ok.includes(file.type)) {
    showToast("Unsupported type. Use JPG, PNG, or PDF.");
    return;
  }

  state.file = file;
  state.rawResponse = "";
  state.answerCache = {};

  el.fileName.textContent = file.name;
  el.uploadZone.classList.add("hidden");
  el.fileViewer.classList.remove("hidden");
  clearSelection();
  setSolutionState("empty");
  disableOutputBtns();

  if (file.type === "application/pdf") {
    state.fileType = "pdf";
    el.fileIcon.textContent = "PDF";
    el.pdfCanvas.classList.remove("hidden");
    el.imgPreview.classList.add("hidden");
    el.pdfNav.classList.remove("hidden");
    loadPDF(file);
  } else {
    state.fileType = "image";
    el.fileIcon.textContent = "IMG";
    el.pdfCanvas.classList.add("hidden");
    el.imgPreview.classList.remove("hidden");
    el.pdfNav.classList.add("hidden");
    loadImage(file);
  }

  setHint(
    isMobile()
      ? 'Tap the "Select" tab to choose a question region'
      : "Drag on the image to select a question, then click Solve",
  );
}

export function resetFile() {
  state.file = null;
  state.pdfDoc = null;
  state.fileType = null;
  state.curPage = 1;
  state.rawResponse = "";
  state.answerCache = {};

  el.fileViewer.classList.add("hidden");
  el.uploadZone.classList.remove("hidden");
  el.fileInput.value = "";
  el.imgPreview.src = "";
  clearSelection();
  setSolutionState("empty");
  disableOutputBtns();
}

export function loadImage(file) {
  const url = URL.createObjectURL(file);
  el.imgPreview.src = url;
  el.imgPreview.onload = () => URL.revokeObjectURL(url);
}

export async function loadPDF(file) {
  const buf = await file.arrayBuffer();
  try {
    state.pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    state.totalPages = state.pdfDoc.numPages;
    state.curPage = 1;
    await renderPDFPage(1);
  } catch (err) {
    console.error(err);
    showToast("Could not load PDF.");
  }
}

export async function renderPDFPage(n) {
  if (!state.pdfDoc) return;
  clearSelection();
  const page = await state.pdfDoc.getPage(n);
  const vp = page.getViewport({ scale: 1.8 });
  const cvs = el.pdfCanvas;
  cvs.width = vp.width;
  cvs.height = vp.height;
  await page.render({ canvasContext: cvs.getContext("2d"), viewport: vp })
    .promise;
  if (el.pageInput) el.pageInput.value = n;
  if (el.pageTotal) el.pageTotal.textContent = state.totalPages;
  el.prevPage.disabled = n <= 1;
  el.nextPage.disabled = n >= state.totalPages;
}
