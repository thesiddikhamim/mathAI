import { state, sel } from './state.js';
import { el, $ } from './dom.js';
import { initTheme, applyTheme } from './theme.js';
import { loadSettings, openSettings, closeSettings, renderSettingsModels, renderVisModels, renderVisEnabledModels, makeEyeToggle, showSettingsSt } from './settings.js';
import { handleFile, resetFile, renderPDFPage } from './file-handler.js';
import { onOverlayDown, onMouseMove, onMouseUp, clearSelection } from './selection.js';
import { renderModelCarousel } from './carousel.js';
import { solveSelection, solveAllSelection, sendFollowUp } from './chat-engine.js';
import { initExporter } from './exporter.js';
import { initMobile } from './mobile.js';
import { setSolutionState, disableOutputBtns, initPanelResize } from './ui-manager.js';

function waitForKaTeX(cb, n = 0) {
  if (typeof renderMathInElement !== "undefined") cb();
  else if (n < 40) setTimeout(() => waitForKaTeX(cb, n + 1), 250);
}

function init() {
  initTheme();
  loadSettings();
  setSolutionState("empty");
  disableOutputBtns();
  initPanelResize();
  initExporter();
  initMobile();

  if (el.solutionContent && el.solutionContent.parentElement) {
    el.solutionContent.parentElement.addEventListener("scroll", () => {
      const parent = el.solutionContent.parentElement;
      // If we are within 60px of the bottom, consider it not scrolled up
      state.isUserScrolledUp = (parent.scrollHeight - parent.scrollTop - parent.clientHeight) > 60;
    }, { passive: true });
  }

  // Bind remaining event listeners
  el.darkToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") !== "dark");
  });

  el.settingsBtn.addEventListener("click", openSettings);
  el.settingsClose.addEventListener("click", closeSettings);
  el.settingsOv.addEventListener("click", (e) => {
    if (e.target === el.settingsOv) closeSettings();
  });

  el.tabModels.addEventListener("click", () => {
    el.tabModels.classList.add("active");
    el.tabVisualization.classList.remove("active");
    el.tabApiKeys.classList.remove("active");
    el.modelsView.classList.add("active");
    el.modelsView.classList.remove("hidden");
    el.visualizationView.classList.remove("active");
    el.visualizationView.classList.add("hidden");
    el.apiKeysView.classList.remove("active");
    el.apiKeysView.classList.add("hidden");
  });

  el.tabVisualization.addEventListener("click", () => {
    el.tabVisualization.classList.add("active");
    el.tabModels.classList.remove("active");
    el.tabApiKeys.classList.remove("active");
    el.visualizationView.classList.add("active");
    el.visualizationView.classList.remove("hidden");
    el.modelsView.classList.remove("active");
    el.modelsView.classList.add("hidden");
    el.apiKeysView.classList.remove("active");
    el.apiKeysView.classList.add("hidden");
  });

  el.tabApiKeys.addEventListener("click", () => {
    el.tabApiKeys.classList.add("active");
    el.tabVisualization.classList.remove("active");
    el.tabModels.classList.remove("active");
    el.apiKeysView.classList.add("active");
    el.apiKeysView.classList.remove("hidden");
    el.visualizationView.classList.remove("active");
    el.visualizationView.classList.add("hidden");
    el.modelsView.classList.remove("active");
    el.modelsView.classList.add("hidden");
  });

  if (el.enableVisualization) {
    el.enableVisualization.addEventListener("change", (e) => {
      if (el.visModelsWrapper) {
        if (e.target.checked) el.visModelsWrapper.classList.remove("hidden");
        else el.visModelsWrapper.classList.add("hidden");
      }
    });
  }

  if (el.enableVisPlanner) {
    el.enableVisPlanner.addEventListener("change", (e) => {
      if (el.visPlannerModelsWrapper) {
        if (e.target.checked) el.visPlannerModelsWrapper.classList.remove("hidden");
        else el.visPlannerModelsWrapper.classList.add("hidden");
      }
    });
  }

  if (el.visModeAsk && el.visModeAuto) {
    el.visModeAsk.addEventListener("change", (e) => {
      if (e.target.checked) state.visMode = "ask";
    });
    el.visModeAuto.addEventListener("change", (e) => {
      if (e.target.checked) state.visMode = "auto";
    });
  }

  if (el.visEngineTikz && el.visEngineMatplotlib) {
    el.visEngineTikz.addEventListener("change", (e) => {
      if (e.target.checked) state.visEngine = "tikz";
    });
    el.visEngineMatplotlib.addEventListener("change", (e) => {
      if (e.target.checked) state.visEngine = "matplotlib";
    });
  }

  makeEyeToggle(el.toggleKeyVis, el.apiKeyInput);
  makeEyeToggle(el.toggleGroqKeyVis, el.groqApiKeyInput);
  makeEyeToggle(el.toggleMistralKeyVis, el.mistralApiKeyInput);
  makeEyeToggle(el.toggleOllamaKeyVis, el.ollamaApiKeyInput);

  el.saveKey.addEventListener("click", () => {
    const gemKey = el.apiKeyInput.value.trim();
    const groqKey = el.groqApiKeyInput.value.trim();
    const mistralKey = el.mistralApiKeyInput.value.trim();
    const ollaKey = el.ollamaApiKeyInput.value.trim();

    if (!gemKey && !groqKey && !mistralKey && !ollaKey) {
      showSettingsSt("Enter at least one API key.", "error");
      return;
    }

    state.apiKey = gemKey;
    state.groqApiKey = groqKey;
    state.mistralApiKey = mistralKey;
    state.ollamaApiKey = ollaKey;

    if (gemKey) localStorage.setItem("mathai-apikey", gemKey);
    else localStorage.removeItem("mathai-apikey");
    if (groqKey) localStorage.setItem("mathai-groq-apikey", groqKey);
    else localStorage.removeItem("mathai-groq-apikey");
    if (mistralKey) localStorage.setItem("mathai-mistral-apikey", mistralKey);
    else localStorage.removeItem("mathai-mistral-apikey");
    if (ollaKey) localStorage.setItem("mathai-ollama-apikey", ollaKey);
    else localStorage.removeItem("mathai-ollama-apikey");

    state.enableVisualization = el.enableVisualization ? el.enableVisualization.checked : false;
    localStorage.setItem("mathai-enable-vis", state.enableVisualization);
    localStorage.setItem("mathai-vis-engine", state.visEngine);
    localStorage.setItem("mathai-vis-mode", state.visMode);
    
    if (state.visModelConfig) {
      localStorage.setItem("mathai-vis-model", state.visModelConfig);
      localStorage.setItem("mathai-vis-enabled", JSON.stringify(state.visEnabledModels));
    }

    state.enableVisPlanner = el.enableVisPlanner ? el.enableVisPlanner.checked : false;
    localStorage.setItem("mathai-enable-vis-planner", state.enableVisPlanner);
    if (state.visPlannerModelConfig) {
      localStorage.setItem("mathai-vis-planner-model", state.visPlannerModelConfig);
    }

    localStorage.setItem("mathai-enabled-providers", JSON.stringify(state.enabledProviders));
    localStorage.setItem("mathai-selected-models", JSON.stringify(state.selectedModels));

    renderModelCarousel();
    showSettingsSt("✓ All settings saved!", "success");
    setTimeout(closeSettings, 1100);
  });

  el.clearKey.addEventListener("click", () => {
    state.apiKey = "";
    state.groqApiKey = "";
    state.mistralApiKey = "";
    state.ollamaApiKey = "";
    el.apiKeyInput.value = "";
    el.groqApiKeyInput.value = "";
    el.mistralApiKeyInput.value = "";
    el.ollamaApiKeyInput.value = "";
    
    state.enabledProviders = { gemini: true, ollama: true, mistral: true, groq: true };
    state.selectedModels = {
      gemini: ["gemini-3.1-pro-preview"],
      ollama: ["qwen3.5:cloud"],
      mistral: ["mistral-large-latest"],
      groq: ["meta-llama/llama-4-scout-17b-16e-instruct"]
    };
    
    state.enableVisualization = false;
    state.visMode = "ask";
    state.enableVisPlanner = false;
    state.visPlannerModelConfig = "ollama:qwen3.5:cloud";
    if (el.enableVisPlanner) el.enableVisPlanner.checked = false;

    renderSettingsModels();
    renderVisModels("coder");
    renderVisModels("planner");
    renderVisEnabledModels();
    
    const keys = [
      "mathai-apikey", "mathai-groq-apikey", "mathai-mistral-apikey", "mathai-ollama-apikey",
      "mathai-enabled-providers", "mathai-selected-models", "mathai-active-tab-id",
      "mathai-enable-vis", "mathai-vis-mode", "mathai-vis-model",
      "mathai-enable-vis-planner", "mathai-vis-planner-model"
    ];
    keys.forEach(k => localStorage.removeItem(k));
    
    renderModelCarousel();
    showSettingsSt("All API keys and models reset.", "success");
  });

  el.uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.uploadZone.classList.add("drag-over");
  });
  el.uploadZone.addEventListener("dragleave", () =>
    el.uploadZone.classList.remove("drag-over"),
  );
  el.uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    el.uploadZone.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  el.uploadZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      el.fileInput.click();
    }
  });
  el.fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
  el.removeFile.addEventListener("click", resetFile);

  el.prevPage.addEventListener("click", () => {
    if (state.curPage > 1) {
      state.curPage--;
      renderPDFPage(state.curPage);
    }
  });
  el.nextPage.addEventListener("click", () => {
    if (state.curPage < state.totalPages) {
      state.curPage++;
      renderPDFPage(state.curPage);
    }
  });

  if (el.pageInput) {
    el.pageInput.addEventListener("change", (e) => {
      let n = parseInt(e.target.value, 10);
      if (isNaN(n)) n = state.curPage;
      if (n < 1) n = 1;
      if (n > state.totalPages) n = state.totalPages;
      if (n !== state.curPage) {
        state.curPage = n;
        renderPDFPage(state.curPage);
      } else {
        e.target.value = state.curPage;
      }
    });
  }

  el.selOverlay.addEventListener("mousedown", onOverlayDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  el.selBox.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("sel-handle")) return;
    e.stopPropagation();
    sel.mode = "move";
    sel.startX = e.clientX;
    sel.startY = e.clientY;
    sel.origX = sel.x;
    sel.origY = sel.y;
    el.selBox.style.cursor = "grabbing";
  });

  el.selBox.querySelectorAll(".sel-handle").forEach((h) => {
    h.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      sel.mode = "resize";
      sel.handle = h.dataset.dir;
      sel.startX = e.clientX;
      sel.startY = e.clientY;
      sel.origX = sel.x;
      sel.origY = sel.y;
      sel.origW = sel.w;
      sel.origH = sel.h;
    });
  });

  el.clearSelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearSelection();
  });

  el.solveSelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    solveSelection(true);
  });

  el.solveAllBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    solveAllSelection();
  });

  el.tryAgainBtn.addEventListener("click", () => {
    solveSelection(false);
  });

  el.chatSendBtn.addEventListener("click", sendFollowUp);
  el.chatRegenerateBtn.addEventListener("click", () => {
    solveSelection(false);
  });
  el.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendFollowUp();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!el.settingsOv.classList.contains("hidden")) closeSettings();
      else clearSelection();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openSettings();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      if (sel.active) solveSelection(true);
    }
  });

  console.info(
    "%cMathAI ready.\nCtrl+K = Settings | Ctrl+Enter = Solve | Esc = Clear",
    "font-weight:bold",
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => waitForKaTeX(init));
} else {
  waitForKaTeX(init);
}
