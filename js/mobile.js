import { state, sel } from './state.js';
import { el, $ } from './dom.js';
import { isMobile, setHint, setSolutionState } from './ui-manager.js';
import { renderSelection, hideMasks, clearSelection, resizeFromHandle } from './selection.js';
import { solveSelection } from './chat-engine.js';
import { handleFile } from './file-handler.js';
import { MIN_SEL } from './config.js';

export function initMobile() {
  const tabViewer = $("tabViewer");
  const tabSelect = $("tabSelectRegion");
  const tabSolution = $("tabSolution");
  const mobileSolveBtn = $("mobileSolveBtn");
  const touchBanner = $("touchSelectBanner");
  const touchCancelBtn = $("touchCancelBtn");
  const leftPanel = $("leftPanel");
  const rightPanel = $("rightPanel");

  if (!tabViewer) return; // Safety in case elements are missing

  /* ── Panel switching ─────────────────────────────────── */
  let activeTab = "viewer";

  window.showPanel = function (tab) {
    activeTab = tab;

    // Update tab active states
    tabViewer.classList.toggle("active", tab === "viewer");
    tabSolution.classList.toggle("active", tab === "solution");
    if (tabSelect) tabSelect.classList.toggle("active", tab === "select");

    // Show/hide panels
    if (tab === "solution") {
      leftPanel.classList.add("panel-hidden");
      rightPanel.classList.remove("panel-hidden");
      mobileSolveBtn.classList.add("hidden");
    } else {
      // viewer or select mode
      rightPanel.classList.add("panel-hidden");
      leftPanel.classList.remove("panel-hidden");
    }

    // Show FAB if there's an active selection and we're on viewer/select tab
    updateFabVisibility();
  };

  function updateFabVisibility() {
    if (!isMobile()) return;
    const onViewerTab = activeTab === "viewer" || activeTab === "select";
    if (onViewerTab && sel.active) {
      mobileSolveBtn.classList.remove("hidden");
    } else {
      mobileSolveBtn.classList.add("hidden");
    }
  }

  tabViewer.addEventListener("click", () => window.showPanel("viewer"));
  tabSolution.addEventListener("click", () => window.showPanel("solution"));

  // Ensure start on viewer tab on mobile
  if (isMobile()) {
    window.showPanel("viewer");
  }

  /* ── Touch Select Mode ───────────────────────────────── */
  let touchSelectActive = false;

  function activateTouchSelectMode() {
    if (touchSelectActive) return;
    touchSelectActive = true;
    tabSelect.classList.add("active");

    // Place initial selection box in the center (50% of overlay)
    const ov = el.selOverlay.getBoundingClientRect();
    const W = ov.width;
    const H = ov.height;

    // Default box: centered, 60% wide, 30% tall
    sel.w = Math.round(W * 0.6);
    sel.h = Math.round(H * 0.3);
    sel.x = Math.round((W - sel.w) / 2);
    sel.y = Math.round((H - sel.h) / 2);
    sel.active = true;

    el.selBox.classList.remove("hidden");
    renderSelection();
    setHint("Drag the blue box to cover your question, then tap Solve");
    if (touchBanner) {
      touchBanner.style.display = "flex";
    }

    updateFabVisibility();
  }

  function deactivateTouchSelectMode() {
    touchSelectActive = false;
    tabSelect.classList.remove("active");
    if (touchBanner) touchBanner.style.display = "none";
    setHint('Tap "Select" to choose a question region');
    clearSelection();
    updateFabVisibility();
  }

  if (touchCancelBtn) {
    touchCancelBtn.addEventListener("click", () => {
      deactivateTouchSelectMode();
      window.showPanel("viewer");
    });
  }

  /* ── Mobile FAB → Solve ──────────────────────────────── */
  mobileSolveBtn.addEventListener("click", () => {
    if (!sel.active) {
      activateTouchSelectMode();
      return;
    }
    // Primary mobile "Solve" action clears global cache
    solveSelection(true);
  });

  /* ── Touch / Pointer events for selection overlay ───── */
  // We add pointer events so touch drag-to-select works without
  // requiring a mouse. These coexist with the mouse events above.

  let ptActive = false;

  el.selOverlay.addEventListener(
    "pointerdown",
    (e) => {
      if (!isMobile()) return;
      if (e.pointerType === "mouse") return; // mouse handled separately
      if (!state.file) return;

      e.preventDefault();
      el.selOverlay.setPointerCapture(e.pointerId);

      if (state.isSolved) {
        state.isSolved = false;
        setSolutionState("empty");
      }

      const rect = el.selOverlay.getBoundingClientRect();
      ptActive = true;
      sel.mode = "draw";
      sel.startX = e.clientX - rect.left;
      sel.startY = e.clientY - rect.top;
      sel.x = sel.startX;
      sel.y = sel.startY;
      sel.w = 0;
      sel.h = 0;
      sel.active = false;
      el.selBox.classList.add("hidden");
      el.selBox.classList.add("dragging");
      hideMasks();
    },
    { passive: false },
  );

  el.selOverlay.addEventListener(
    "pointermove",
    (e) => {
      if (!ptActive || !isMobile()) return;
      if (e.pointerType === "mouse") return;
      e.preventDefault();
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
    },
    { passive: false },
  );

  el.selOverlay.addEventListener("pointerup", (e) => {
    if (!ptActive || !isMobile()) return;
    if (e.pointerType === "mouse") return;
    ptActive = false;
    if (sel.mode === "draw") {
      if (sel.w < MIN_SEL || sel.h < MIN_SEL) {
        clearSelection();
      } else {
        sel.active = true;
        renderSelection();
        setHint('Good! Tap "Solve ⚡" to get the solution');
      }
    }
    sel.mode = null;
    sel.handle = null;
    el.selBox.classList.remove("dragging");
    updateFabVisibility();
  });

  // Touch move/resize on sel-box (for mobile selecting existing box)
  el.selBox.addEventListener(
    "pointerdown",
    (e) => {
      if (!isMobile()) return;
      if (e.pointerType === "mouse") return;
      if (e.target.classList.contains("sel-handle")) return;
      e.stopPropagation();
      e.preventDefault();
      el.selBox.setPointerCapture(e.pointerId);
      el.selBox.classList.add("dragging");
      if (navigator.vibrate) navigator.vibrate(10);
      sel.mode = "move";
      sel.startX = e.clientX;
      sel.startY = e.clientY;
      sel.origX = sel.x;
      sel.origY = sel.y;
    },
    { passive: false },
  );

  el.selBox.addEventListener(
    "pointermove",
    (e) => {
      if (!isMobile() || sel.mode !== "move") return;
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      const rect = el.selOverlay.getBoundingClientRect();
      const dx = e.clientX - sel.startX;
      const dy = e.clientY - sel.startY;
      sel.x = Math.max(0, Math.min(sel.origX + dx, rect.width - sel.w));
      sel.y = Math.max(0, Math.min(sel.origY + dy, rect.height - sel.h));
      renderSelection();
    },
    { passive: false },
  );

  el.selBox.addEventListener("pointerup", (e) => {
    if (!isMobile()) return;
    if (e.pointerType === "mouse") return;
    el.selBox.classList.remove("dragging");
    sel.mode = null;
  });

  // Touch resize handles
  el.selBox.querySelectorAll(".sel-handle").forEach((h) => {
    h.addEventListener(
      "pointerdown",
      (e) => {
        if (!isMobile()) return;
        if (e.pointerType === "mouse") return;
        e.stopPropagation();
        e.preventDefault();
        h.setPointerCapture(e.pointerId);
        el.selBox.classList.add("dragging");
        if (navigator.vibrate) navigator.vibrate(10);
        sel.mode = "resize";
        sel.handle = h.dataset.dir;
        sel.startX = e.clientX;
        sel.startY = e.clientY;
        sel.origX = sel.x;
        sel.origY = sel.y;
        sel.origW = sel.w;
        sel.origH = sel.h;
      },
      { passive: false },
    );

    h.addEventListener(
      "pointermove",
      (e) => {
        if (!isMobile() || sel.mode !== "resize") return;
        if (e.pointerType === "mouse") return;
        e.preventDefault();
        const rect = el.selOverlay.getBoundingClientRect();
        resizeFromHandle(
          sel.handle,
          e.clientX - sel.startX,
          e.clientY - sel.startY,
          rect,
        );
        renderSelection();
      },
      { passive: false },
    );

    h.addEventListener("pointerup", (e) => {
      if (!isMobile()) return;
      if (e.pointerType === "mouse") return;
      el.selBox.classList.remove("dragging");
      sel.mode = null;
      updateFabVisibility();
    });
  });

  /* ── Window resize: reset panel visibility on desktop ── */
  window.addEventListener("resize", () => {
    if (!isMobile()) {
      leftPanel.classList.remove("panel-hidden");
      rightPanel.classList.remove("panel-hidden");
      mobileSolveBtn.classList.add("hidden");
    } else {
      // Re-apply current tab
      window.showPanel(activeTab);
    }
  });

  /* ── Update FAB whenever selection changes ───────────── */
  // Hook into existing clearSelection
  const _origClear = clearSelection;
  window.clearSelection = function () {
    _origClear();
    updateFabVisibility();
    if (isMobile() && touchSelectActive) {
      touchSelectActive = false;
      if (touchBanner) touchBanner.style.display = "none";
      tabSelect.classList.remove("active");
      tabViewer.classList.add("active");
    }
  };
}
