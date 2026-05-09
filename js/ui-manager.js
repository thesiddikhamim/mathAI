import { el, $ } from './dom.js';

export function setSolutionState(mode) {
  el.emptyState.classList.toggle("hidden", mode !== "empty");
  el.loadingState.classList.toggle("hidden", mode !== "loading");
  el.solutionContent.classList.toggle(
    "hidden",
    mode !== "content" && mode !== "error",
  );

  if (el.chatContainer) {
    el.chatContainer.classList.toggle("hidden", mode !== "content");
  }
}

export function enableOutputBtns() {
  [el.copyBtn, el.copyLatexBtn, el.downloadBtn].forEach(
    (b) => (b.disabled = false),
  );
}

export function disableOutputBtns() {
  [el.copyBtn, el.copyLatexBtn, el.downloadBtn].forEach(
    (b) => (b.disabled = true),
  );
}

export function setHint(msg) {
  el.hintText.textContent = msg;
}

export function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}

export function initPanelResize() {
  const divider = $("panelDivider");
  const left = $("leftPanel");
  const layout = document.querySelector(".main-layout");
  let drag = false,
    startX = 0,
    startW = 0;

  divider.addEventListener("mousedown", (e) => {
    if (window.innerWidth <= 768) return;
    drag = true;
    startX = e.clientX;
    startW = left.getBoundingClientRect().width;
    divider.classList.add("dragging");
    document.body.style.cssText += ";cursor:col-resize;user-select:none";
  });
  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const total = layout.getBoundingClientRect().width;
    const nw = Math.min(
      Math.max(startW + e.clientX - startX, total * 0.2),
      total * 0.8,
    );
    left.style.flex = `0 0 ${((nw / total) * 100).toFixed(2)}%`;
    left.style.width = `${((nw / total) * 100).toFixed(2)}%`;
  });
  document.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = false;
    divider.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}
