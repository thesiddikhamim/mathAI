import { state, sel } from './state.js';
import { el } from './dom.js';
import { MIN_SEL } from './config.js';
import { setSolutionState, setHint, isMobile } from './ui-manager.js';

export function onOverlayDown(e) {
  if (!state.file) return;
  // Only start fresh draw on primary button
  if (e.button !== 0) return;

  // If already solved, a click on overlay (or start of new drag)
  // signals we want to start a new question.
  if (state.isSolved) {
    state.isSolved = false;
    setSolutionState("empty");
    setHint("Drag to select a new question");
  }

  const rect = el.selOverlay.getBoundingClientRect();
  sel.mode = "draw";
  sel.startX = e.clientX - rect.left;
  sel.startY = e.clientY - rect.top;
  sel.x = sel.startX;
  sel.y = sel.startY;
  sel.w = 0;
  sel.h = 0;
  sel.active = false;
  el.selBox.classList.add("hidden");
  hideMasks();
}

export function onMouseMove(e) {
  if (!sel.mode) return;
  const rect = el.selOverlay.getBoundingClientRect();

  if (sel.mode === "draw") {
    const mx = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const my = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);

    sel.x = Math.min(mx, sel.startX);
    sel.y = Math.min(my, sel.startY);
    sel.w = Math.abs(mx - sel.startX);
    sel.h = Math.abs(my - sel.startY);

    if (sel.w > 5 || sel.h > 5) {
      sel.active = true;
      el.selBox.classList.remove("hidden");
      renderSelection();
    }
  } else if (sel.mode === "move") {
    const dx = e.clientX - sel.startX;
    const dy = e.clientY - sel.startY;
    sel.x = Math.max(0, Math.min(sel.origX + dx, rect.width - sel.w));
    sel.y = Math.max(0, Math.min(sel.origY + dy, rect.height - sel.h));
    renderSelection();
  } else if (sel.mode === "resize") {
    const dx = e.clientX - sel.startX;
    const dy = e.clientY - sel.startY;
    resizeFromHandle(sel.handle, dx, dy, rect);
    renderSelection();
  }
}

export function onMouseUp() {
  if (sel.mode === "draw") {
    if (sel.w < MIN_SEL || sel.h < MIN_SEL) {
      clearSelection();
    } else {
      sel.active = true;
      renderSelection();
      setHint(
        isMobile()
          ? "Drag the box to resize — tap Solve ⚡ when ready"
          : "Adjust the selection, then click Solve",
      );
    }
  }
  if (sel.mode === "move") {
    el.selBox.style.cursor = "move";
  }
  sel.mode = null;
  sel.handle = null;
}

export function resizeFromHandle(dir, dx, dy, overlayRect) {
  let { origX, origY, origW, origH } = sel;
  let x = origX,
    y = origY,
    w = origW,
    h = origH;

  if (dir.includes("e")) {
    w = Math.max(MIN_SEL, origW + dx);
  }
  if (dir.includes("s")) {
    h = Math.max(MIN_SEL, origH + dy);
  }
  if (dir.includes("w")) {
    const nw = Math.max(MIN_SEL, origW - dx);
    x = origX + (origW - nw);
    w = nw;
  }
  if (dir.includes("n")) {
    const nh = Math.max(MIN_SEL, origH - dy);
    y = origY + (origH - nh);
    h = nh;
  }

  // Clamp to overlay bounds
  x = Math.max(0, Math.min(x, overlayRect.width - MIN_SEL));
  y = Math.max(0, Math.min(y, overlayRect.height - MIN_SEL));
  w = Math.min(w, overlayRect.width - x);
  h = Math.min(h, overlayRect.height - y);

  sel.x = x;
  sel.y = y;
  sel.w = w;
  sel.h = h;
}

export function renderSelection() {
  if (renderSelection._pending) return;
  renderSelection._pending = true;

  requestAnimationFrame(() => {
    renderSelection._pending = false;
    const { x, y, w, h } = sel;

    // Position the selection box
    Object.assign(el.selBox.style, {
      left: x + "px",
      top: y + "px",
      width: w + "px",
      height: h + "px",
    });

    // Update dark masks
    const ov = el.selOverlay.getBoundingClientRect();
    const W = ov.width;
    const H = ov.height;

    Object.assign(el.maskTop.style, {
      top: "0",
      left: "0",
      width: W + "px",
      height: y + "px",
    });
    Object.assign(el.maskBottom.style, {
      top: y + h + "px",
      left: "0",
      width: W + "px",
      height: H - y - h + "px",
    });
    Object.assign(el.maskLeft.style, {
      top: y + "px",
      left: "0",
      width: x + "px",
      height: h + "px",
    });
    Object.assign(el.maskRight.style, {
      top: y + "px",
      left: x + w + "px",
      width: W - x - w + "px",
      height: h + "px",
    });

    // Show masks
    [el.maskTop, el.maskBottom, el.maskLeft, el.maskRight].forEach((m) => {
      m.style.display = "block";
    });

    // Update dimension label
    updateDimLabel();

    // Flip toolbar if near bottom
    const nearBottom = y + h + 60 > H;
    el.selBox.classList.toggle("toolbar-above", nearBottom);

    // Prevent toolbar from overflowing horizontally
    const tb = document.getElementById("selToolbar");
    if (tb) {
      tb.style.left = "";
      tb.style.right = "";
      tb.style.transform = "";
      const tbW = tb.offsetWidth || 200; // fallback if offsetWidth 0
      const centerX = x + w / 2;

      if (centerX - tbW / 2 < 10) {
        tb.style.left = 10 - x + "px";
        tb.style.transform = "none";
      } else if (centerX + tbW / 2 > W - 10) {
        tb.style.left = "auto";
        tb.style.right = 10 - (W - (x + w)) + "px";
        tb.style.transform = "none";
      } else {
        tb.style.left = "50%";
        tb.style.transform = "translateX(-50%)";
      }
    }
  });
}

export function updateDimLabel() {
  let label = el.selBox.querySelector(".sel-dimensions");
  if (!label) {
    label = document.createElement("div");
    label.className = "sel-dimensions";
    el.selBox.prepend(label);
  }
  label.textContent = `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
}

export function hideMasks() {
  [el.maskTop, el.maskBottom, el.maskLeft, el.maskRight].forEach((m) => {
    m.style.display = "none";
  });
}

export function clearSelection() {
  sel.active = false;
  sel.mode = null;
  sel.x = 0;
  sel.y = 0;
  sel.w = 0;
  sel.h = 0;
  el.selBox.classList.add("hidden");
  hideMasks();
}

export function cropSelectionToBase64() {
  const tmp = document.createElement("canvas");
  const ctx = tmp.getContext("2d");

  let source, naturalW, naturalH, displayW, displayH, offsetX, offsetY;

  if (state.fileType === "image") {
    source = el.imgPreview;
    naturalW = source.naturalWidth;
    naturalH = source.naturalHeight;
    const r = source.getBoundingClientRect();
    displayW = r.width;
    displayH = r.height;
    // Offset of image inside overlay
    const ov = el.selOverlay.getBoundingClientRect();
    offsetX = r.left - ov.left;
    offsetY = r.top - ov.top;
  } else {
    // PDF canvas
    source = el.pdfCanvas;
    naturalW = source.width; // canvas pixel width (rendered at 1.8 scale)
    naturalH = source.height;
    const r = source.getBoundingClientRect();
    displayW = r.width;
    displayH = r.height;
    const ov = el.selOverlay.getBoundingClientRect();
    offsetX = r.left - ov.left;
    offsetY = r.top - ov.top;
  }

  // Scale factor: natural pixels per display pixel
  const scaleX = naturalW / displayW;
  const scaleY = naturalH / displayH;

  // Crop rect in natural pixel space
  const cropX = Math.max(0, (sel.x - offsetX) * scaleX);
  const cropY = Math.max(0, (sel.y - offsetY) * scaleY);
  let cropW = Math.min(sel.w * scaleX, naturalW - cropX);
  let cropH = Math.min(sel.h * scaleY, naturalH - cropY);

  if (cropW <= 0 || cropH <= 0) return null;

  // Scale down if image is too large (max 1000px per dimension)
  const maxDim = 1000;
  let finalW = cropW;
  let finalH = cropH;
  if (cropW > maxDim || cropH > maxDim) {
    const ratio = Math.min(maxDim / cropW, maxDim / cropH);
    finalW = Math.floor(cropW * ratio);
    finalH = Math.floor(cropH * ratio);
  }

  tmp.width = finalW;
  tmp.height = finalH;

  if (state.fileType === "image") {
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);
  } else {
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);
  }

  // Return base64 without the data
  return tmp.toDataURL("image/jpeg", 0.8).split(",")[1];
}
