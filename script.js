/**
 * MathAI — script.js
 * Draw a selection rectangle on an image/PDF → send cropped region
 * to Gemini Vision API → render solution with LaTeX/Markdown.
 */

"use strict";

/* ── PDF.js worker ──────────────────────────────────────── */
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
}

/* ── DOM refs ───────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const el = {
  // Header
  darkToggle: $("darkModeToggle"),
  sunIcon: document.querySelector(".sun-icon"),
  moonIcon: document.querySelector(".moon-icon"),
  settingsBtn: $("settingsToggle"),

  // Settings
  settingsOv: $("settingsOverlay"),
  settingsClose: $("settingsClose"),
  tabApiKeys: $("tabApiKeys"),
  tabModels: $("tabModels"),
  tabVisualization: $("tabVisualization"),
  apiKeysView: $("apiKeysView"),
  modelsView: $("modelsView"),
  visualizationView: $("visualizationView"),
  enableVisualization: $("enableVisualization"),
  visModelsWrapper: $("visModelsWrapper"),
  visModelsContainer: $("visModelsContainer"),
  visEnabledModelsContainer: $("visEnabledModelsContainer"),
  visModeAsk: $("visModeAsk"),
  visModeAuto: $("visModeAuto"),

  apiKeyInput: $("apiKeyInput"),
  toggleKeyVis: $("toggleKeyVisibility"),
  eyeOpen: document.querySelector(".eye-open"),
  eyeClosed: document.querySelector(".eye-closed"),

  // Groq
  groqApiKeyInput: $("groqApiKeyInput"),
  toggleGroqKeyVis: $("toggleGroqKeyVis"),
  
  // Mistral
  mistralApiKeyInput: $("mistralApiKeyInput"),
  toggleMistralKeyVis: $("toggleMistralKeyVis"),
  
  // Ollama
  ollamaApiKeyInput: $("ollamaApiKeyInput"),
  toggleOllamaKeyVis: $("toggleOllamaKeyVis"),
  // Settings actions
  saveKey: $("saveApiKey"),
  clearKey: $("clearApiKey"),
  settingsSt: $("settingsStatus"),

  // Upload
  uploadZone: $("uploadZone"),
  fileInput: $("fileInput"),
  fileViewer: $("fileViewer"),
  fileIcon: $("fileIcon"),
  fileName: $("fileName"),
  removeFile: $("removeFile"),

  // PDF Nav
  pdfNav: $("pdfNav"),
  prevPage: $("prevPage"),
  nextPage: $("nextPage"),
  pageInput: $("pageInput"),
  pageTotal: $("pageTotal"),

  // Viewer
  pdfCanvas: $("pdfCanvas"),
  imgPreview: $("imagePreview"),
  viewerBody: $("viewerBody"),
  hintText: $("hintText"),

  // Selection overlay
  selOverlay: $("selOverlay"),
  selBox: $("selBox"),
  maskTop: $("maskTop"),
  maskBottom: $("maskBottom"),
  maskLeft: $("maskLeft"),
  maskRight: $("maskRight"),
  solveSelBtn: $("solveSelBtn"),
  solveAllBtn: $("solveAllBtn"),
  clearSelBtn: $("clearSelBtn"),

  // Solution
  downloadBtn: $("downloadBtn"),
  copyLatexBtn: $("copyLatexBtn"),
  copyBtn: $("copyBtn"),
  emptyState: $("emptyState"),
  loadingState: $("loadingState"),
  loadingSubText: $("loadingSubText"),
  errorActions: $("errorActions"),
  tryAgainBtn: $("tryAgainBtn"),
  emptySubText: $("emptySubText"),
  solutionContent: $("solutionContent"),

  // Carousel Switcher
  modelCarousel: $("modelCarousel"),

  // Chat
  chatContainer: $("chatContainer"),
  chatInput: $("chatInput"),
  chatSendBtn: $("chatSendBtn"),
  chatRegenerateBtn: $("chatRegenerateBtn"),

  // Toast
  toast: $("toast"),

  // PDF Template
  pdfTemplate: $("pdfTemplate"),
  pdfDate: $("pdfDate"),
  pdfModel: $("pdfModel"),
  pdfQuestionImg: $("pdfQuestionImg"),
  pdfSolutionContent: $("pdfSolutionContent"),
};

/* ── App state ──────────────────────────────────────────── */
const state = {
  fileType: null, // 'image' | 'pdf'
  file: null,
  pdfDoc: null,
  curPage: 1,
  totalPages: 0,
  rawResponse: "",
  // Per-provider credentials
  apiKey: "",
  groqApiKey: "",
  mistralApiKey: "",
  ollamaApiKey: "",
  // Enabled providers
  enabledProviders: {
    gemini: true,
    ollama: true,
    mistral: true,
    groq: true
  },
  // Selected models per provider
  selectedModels: {
    gemini: ["gemini-3.1-pro-preview"],
    ollama: ["qwen3.5:cloud"],
    mistral: ["mistral-large-latest"],
    groq: ["meta-llama/llama-4-scout-17b-16e-instruct"]
  },
  enableVisualization: false,
  visMode: "ask", // "ask" or "auto"
  visModelConfig: "ollama:qwen3.5:cloud",
  visEnabledModels: ["gemini:gemini-3.1-pro-preview", "ollama:qwen3.5:cloud"],
  // Active tab ID (e.g. "gemini:gemini-3.1-pro-preview")
  activeTabId: "gemini:gemini-3.1-pro-preview",
  chatHistory: [],
  isSolved: false,
  isUserScrolledUp: false, // Track if user scrolled up during streaming
  // Cache keyed by tab ID
  answerCache: {},
  // Track running operations keyed by tab ID
  runningJobs: {},
  jobNodes: {}, // DOM elements for jobs running in the background
};

/* ── Selection state ────────────────────────────────────── */
const sel = {
  active: false, // A selection exists
  x: 0,
  y: 0, // Top-left in overlay coordinates
  w: 0,
  h: 0, // Width & height

  // Interaction
  mode: null, // 'draw' | 'move' | 'resize'
  handle: null, // Which handle is being dragged (nw,n,ne,e,se,s,sw,w)
  startX: 0,
  startY: 0,
  origX: 0,
  origY: 0,
  origW: 0,
  origH: 0,
};

const MIN_SEL = 20; // Minimum selection size in px

const AVAILABLE_MODELS = {
  gemini: [
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
    { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash-Lite" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" }
  ],
  ollama: [
    { id: "qwen3.5:cloud", label: "Qwen 3.5 Cloud" },
    { id: "qwen3.5:397b-cloud", label: "Qwen 3.5 397B" },
    { id: "glm-5.1:cloud", label: "GLM 5.1" },
    { id: "qwen3-coder-next:cloud", label: "Qwen 3 Coder Next" },
    { id: "deepseek-v3.2:cloud", label: "DeepSeek V3.2" },
    { id: "gemma4:31b-cloud", label: "Gemma 4 31B" },
    { id: "kimi-k2.5:cloud", label: "Kimi K2.5" },
    { id: "llama3.2:latest", label: "Llama 3.2" }
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "mistral-medium-latest", label: "Mistral Medium" },
    { id: "pixtral-large-latest", label: "Pixtral Large" },
    { id: "codestral-latest", label: "Codestral" },
    { id: "codestral-2508", label: "Codestral 2508" },
    { id: "devstral-2512", label: "Devstral 2512" },
    { id: "devstral-latest", label: "Devstral Latest" }
  ],
  groq: [
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
    { id: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick 17B" },
    { id: "groq/compound", label: "Compound Groq" },
    { id: "qwen-qwq-32b", label: "Qwen QwQ 32B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
    { id: "openai/gpt-oss-20b", label: "GPT OSS 20B" }
  ]
};

/* =========================================================
   UTILITY
   ========================================================= */

function showToast(msg, ms = 2800) {
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => el.toast.classList.add("show")),
  );
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.toast.classList.remove("show");
    setTimeout(() => el.toast.classList.add("hidden"), 350);
  }, ms);
}

function setSolutionState(mode) {
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

function enableOutputBtns() {
  [el.copyBtn, el.copyLatexBtn, el.downloadBtn].forEach(
    (b) => (b.disabled = false),
  );
}
function disableOutputBtns() {
  [el.copyBtn, el.copyLatexBtn, el.downloadBtn].forEach(
    (b) => (b.disabled = true),
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("✓ Copied to clipboard");
  } catch {
    const ta = Object.assign(document.createElement("textarea"), {
      value: text,
      style: "position:fixed;opacity:0",
    });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast("✓ Copied");
  }
}

/* =========================================================
   DARK MODE
   ========================================================= */

function applyTheme(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  el.sunIcon.classList.toggle("hidden", dark);
  el.moonIcon.classList.toggle("hidden", !dark);
  localStorage.setItem("mathai-theme", dark ? "dark" : "light");
}

function initTheme() {
  const saved = localStorage.getItem("mathai-theme");
  const sys = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved ? saved === "dark" : sys);
}

el.darkToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") !== "dark");
});

/* =========================================================
   SETTINGS
   ========================================================= */

function renderSettingsModels() {
  el.modelsView.innerHTML = "";
  
  const providers = [
    { id: "gemini", name: "Google Gemini", icon: "gemini.svg" },
    { id: "ollama", name: "Ollama Cloud", icon: "ollama.svg" },
    { id: "mistral", name: "Mistral AI", icon: "mistral.svg" },
    { id: "groq", name: "Groq", icon: "groq.svg" }
  ];

  providers.forEach(p => {
    const isEnabled = state.enabledProviders[p.id];
    
    // Header
    const header = document.createElement("div");
    header.className = "settings-provider-header";
    header.innerHTML = `
      <div class="provider-header-left">
        <img src="https://unpkg.com/@lobehub/icons-static-svg@latest/icons/${p.icon}" class="provider-logo" alt="${p.name}" />
        <span>${p.name}</span>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" class="provider-toggle" data-provider="${p.id}" ${isEnabled ? "checked" : ""}>
        <span class="slider"></span>
      </label>
    `;
    el.modelsView.appendChild(header);

    // Models container
    if (isEnabled && AVAILABLE_MODELS[p.id]) {
      const grid = document.createElement("div");
      grid.className = "models-grid";
      
      AVAILABLE_MODELS[p.id].forEach(m => {
        const isSelected = state.selectedModels[p.id].includes(m.id);
        const lbl = document.createElement("label");
        lbl.className = "model-checkbox-label";
        lbl.innerHTML = `
          <input type="checkbox" class="model-checkbox" data-provider="${p.id}" value="${m.id}" ${isSelected ? "checked" : ""}>
          ${m.label}
        `;
        grid.appendChild(lbl);
      });
      el.modelsView.appendChild(grid);
    }
    
    const divider = document.createElement("div");
    divider.className = "settings-divider";
    el.modelsView.appendChild(divider);
  });

  // Attach event listeners
  el.modelsView.querySelectorAll(".provider-toggle").forEach(cb => {
    cb.addEventListener("change", e => {
      state.enabledProviders[e.target.dataset.provider] = e.target.checked;
      renderSettingsModels(); // re-render to show/hide models
      renderVisModels(); renderVisEnabledModels(); // re-render visualization models list
    });
  });

  el.modelsView.querySelectorAll(".model-checkbox").forEach(cb => {
    cb.addEventListener("change", e => {
      const p = e.target.dataset.provider;
      const val = e.target.value;
      if (e.target.checked) {
        if (!state.selectedModels[p].includes(val)) {
          state.selectedModels[p].push(val);
        }
      } else {
        state.selectedModels[p] = state.selectedModels[p].filter(x => x !== val);
      }
    });
  });
}


function renderVisEnabledModels() {
  if (!el.visEnabledModelsContainer) return;
  el.visEnabledModelsContainer.innerHTML = "";
  
  const providers = [
    { id: "gemini", name: "Google Gemini", icon: "gemini.svg" },
    { id: "ollama", name: "Ollama Cloud", icon: "ollama.svg" },
    { id: "mistral", name: "Mistral AI", icon: "mistral.svg" },
    { id: "groq", name: "Groq", icon: "groq.svg" }
  ];

  providers.forEach((p) => {
    const isEnabled = state.enabledProviders[p.id];
    const selected = state.selectedModels[p.id] || [];
    
    if (isEnabled && selected.length > 0 && AVAILABLE_MODELS[p.id]) {
      const group = document.createElement("div");
      group.className = "vis-provider-group";
      group.style.marginBottom = "20px";
      
      const header = document.createElement("div");
      header.className = "provider-header-left";
      header.style.marginBottom = "10px";
      header.innerHTML = `
        <img src="https://unpkg.com/@lobehub/icons-static-svg@latest/icons/${p.icon}" class="provider-logo" alt="${p.name}" style="width: 18px; height: 18px;" />
        <span style="font-size:14px; font-weight:600; color:var(--text-secondary);">${p.name}</span>
      `;
      group.appendChild(header);
      
      const grid = document.createElement("div");
      grid.className = "models-grid";
      
      selected.forEach(modelId => {
        const m = AVAILABLE_MODELS[p.id].find(x => x.id === modelId);
        if (!m) return;
        
        const val = p.id + ":" + m.id;
        const isSelected = state.visEnabledModels.includes(val);
        
        const lbl = document.createElement("label");
        lbl.className = "model-checkbox-label";
        
        lbl.innerHTML = `
          <input type="checkbox" class="vis-model-checkbox" value="${val}" ${isSelected ? "checked" : ""}>
          ${m.label}
        `;
        grid.appendChild(lbl);
      });
      
      group.appendChild(grid);
      el.visEnabledModelsContainer.appendChild(group);
    }
  });

  el.visEnabledModelsContainer.querySelectorAll(".vis-model-checkbox").forEach(cb => {
    cb.addEventListener("change", e => {
      const val = e.target.value;
      if (e.target.checked) {
        if (!state.visEnabledModels.includes(val)) state.visEnabledModels.push(val);
      } else {
        state.visEnabledModels = state.visEnabledModels.filter(x => x !== val);
      }
    });
  });
}



function renderVisModels() {
  if (!el.visModelsContainer) return;
  el.visModelsContainer.innerHTML = "";
  
  const providers = [
    { id: "gemini", name: "Google Gemini", icon: "gemini.svg" },
    { id: "ollama", name: "Ollama Cloud", icon: "ollama.svg" },
    { id: "mistral", name: "Mistral AI", icon: "mistral.svg" },
    { id: "groq", name: "Groq", icon: "groq.svg" }
  ];

  providers.forEach((p, index) => {
    const isEnabled = state.enabledProviders[p.id];
    if (isEnabled && AVAILABLE_MODELS[p.id]) {
      const group = document.createElement("div");
      group.className = "vis-provider-group";
      group.style.marginBottom = "20px";
      
      const header = document.createElement("div");
      header.className = "provider-header-left";
      header.style.marginBottom = "10px";
      header.innerHTML = `
        <img src="https://unpkg.com/@lobehub/icons-static-svg@latest/icons/${p.icon}" class="provider-logo" alt="${p.name}" style="width: 18px; height: 18px;" />
        <span style="font-size:14px; font-weight:600; color:var(--text-secondary);">${p.name}</span>
      `;
      group.appendChild(header);
      
      const grid = document.createElement("div");
      grid.className = "models-grid";
      
      AVAILABLE_MODELS[p.id].forEach(m => {
        const val = p.id + ":" + m.id;
        const isSelected = state.visModelConfig === val;
        
        const lbl = document.createElement("label");
        lbl.className = "model-checkbox-label";
        
        lbl.innerHTML = `
          <input type="radio" name="visModelGlobalRadio" class="model-radio" value="${val}" ${isSelected ? "checked" : ""}>
          ${m.label}
        `;
        grid.appendChild(lbl);
      });
      
      group.appendChild(grid);
      el.visModelsContainer.appendChild(group);
      
      // Add a mini divider if it's not the last enabled one, but visual spacing is usually enough.
    }
  });

  // Add event listeners for the radio buttons
  el.visModelsContainer.querySelectorAll(".model-radio").forEach(radio => {
    radio.addEventListener("change", e => {
      if (e.target.checked) {
        state.visModelConfig = e.target.value;
      }
    });
  });
}

function openSettings() {
  el.apiKeyInput.value = state.apiKey;
  el.groqApiKeyInput.value = state.groqApiKey;
  el.mistralApiKeyInput.value = state.mistralApiKey;
  el.ollamaApiKeyInput.value = state.ollamaApiKey;
  
  if (el.enableVisualization) {
    el.enableVisualization.checked = state.enableVisualization;
    if (el.visModelsWrapper) {
      el.visModelsWrapper.classList.toggle("hidden", !state.enableVisualization);
    }
  }

  if (el.visModeAsk && el.visModeAuto) {
    el.visModeAsk.checked = state.visMode === "ask";
    el.visModeAuto.checked = state.visMode === "auto";
  }
  
  renderVisModels(); renderVisEnabledModels();
  
  renderSettingsModels();
  
  el.settingsSt.classList.add("hidden");
  el.settingsOv.classList.remove("hidden");
  setTimeout(() => el.apiKeyInput.focus(), 80);
}
function closeSettings() {
  el.settingsOv.classList.add("hidden");
}

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

el.settingsBtn.addEventListener("click", openSettings);
el.settingsClose.addEventListener("click", closeSettings);
el.settingsOv.addEventListener("click", (e) => {
  if (e.target === el.settingsOv) closeSettings();
});

if (el.enableVisualization) {
  el.enableVisualization.addEventListener("change", (e) => {
    if (el.visModelsWrapper) {
      if (e.target.checked) {
        el.visModelsWrapper.classList.remove("hidden");
      } else {
        el.visModelsWrapper.classList.add("hidden");
      }
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

// Eye toggle for each provider key
function makeEyeToggle(btn, input) {
  btn.addEventListener("click", () => {
    const pw = input.type === "password";
    input.type = pw ? "text" : "password";
    btn.querySelector(".eye-open").classList.toggle("hidden", pw);
    btn.querySelector(".eye-closed").classList.toggle("hidden", !pw);
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
  localStorage.setItem("mathai-vis-mode", state.visMode);
  
  if (state.visModelConfig) {
    localStorage.setItem("mathai-vis-model", state.visModelConfig);
    localStorage.setItem("mathai-vis-enabled", JSON.stringify(state.visEnabledModels));
  }

  localStorage.setItem("mathai-enabled-providers", JSON.stringify(state.enabledProviders));
  localStorage.setItem("mathai-selected-models", JSON.stringify(state.selectedModels));

  renderModelCarousel();

  // Instantly update visualization if a problem is currently solved
  if (state.isSolved && state.activeTabId && state.jobNodes[state.activeTabId]) {
    const activeWrapper = state.jobNodes[state.activeTabId];
    const oldVis = activeWrapper.querySelector(".vis-container");
    if (oldVis) oldVis.remove();
    
    if (state.enableVisualization && state.rawResponse && state.rawResponse.trim().length > 0) {
      renderVisualization(state.rawResponse, activeWrapper, state.activeTabId)
        .then(() => {
          if (state.answerCache[state.activeTabId]) {
            state.answerCache[state.activeTabId].solutionHTML = activeWrapper.innerHTML;
          }
        })
        .catch(console.error);
    } else {
      if (state.answerCache[state.activeTabId]) {
        state.answerCache[state.activeTabId].solutionHTML = activeWrapper.innerHTML;
      }
    }
  }

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
  state.visModelConfig = "ollama:qwen3.5:cloud";
  if (el.enableVisualization) el.enableVisualization.checked = false;
  if (el.visModeAsk && el.visModeAuto) {
    el.visModeAsk.checked = true;
    el.visModeAuto.checked = false;
  }
  
  renderSettingsModels();
  renderVisModels(); renderVisEnabledModels();
  
  const keys = [
    "mathai-apikey", "mathai-groq-apikey", "mathai-mistral-apikey", "mathai-ollama-apikey",
    "mathai-enabled-providers", "mathai-selected-models", "mathai-active-tab-id",
    "mathai-enable-vis", "mathai-vis-mode", "mathai-vis-model"
  ];
  keys.forEach(k => localStorage.removeItem(k));
  
  renderModelCarousel();
  
  showSettingsSt("All API keys and models reset.", "success");
});

function showSettingsSt(msg, type) {
  el.settingsSt.textContent = msg;
  el.settingsSt.className = `settings-status ${type}`;
  el.settingsSt.classList.remove("hidden");
}

function loadSettings() {
  const k = localStorage.getItem("mathai-apikey");
  const gk = localStorage.getItem("mathai-groq-apikey");
  const mk = localStorage.getItem("mathai-mistral-apikey");
  const ok = localStorage.getItem("mathai-ollama-apikey");
  
  const ep = localStorage.getItem("mathai-enabled-providers");
  const sm = localStorage.getItem("mathai-selected-models");
  const activeTabId = localStorage.getItem("mathai-active-tab-id");
  const enableVis = localStorage.getItem("mathai-enable-vis");
  const visModMode = localStorage.getItem("mathai-vis-mode");
  const visMod = localStorage.getItem("mathai-vis-model");
  const visEnList = localStorage.getItem("mathai-vis-enabled");

  if (k) state.apiKey = k;
  if (gk) state.groqApiKey = gk;
  if (mk) state.mistralApiKey = mk;
  if (ok) state.ollamaApiKey = ok;
  
  if (enableVis !== null) state.enableVisualization = enableVis === "true";
  if (visModMode) state.visMode = visModMode;
  if (visMod) state.visModelConfig = visMod;
  if (visEnList) {
    try {
      state.visEnabledModels = JSON.parse(visEnList);
    } catch(e) {}
  }

  try {
    if (ep) {
       const parsedEp = JSON.parse(ep);
       for (const p in state.enabledProviders) {
         if (parsedEp[p] !== undefined) {
           state.enabledProviders[p] = !!parsedEp[p];
         }
       }
    }
    if (sm) {
      const parsedSm = JSON.parse(sm);
      for (const p in state.selectedModels) {
        if (parsedSm[p] !== undefined && Array.isArray(parsedSm[p])) {
          const uniqueModels = [...new Set(parsedSm[p])];
          state.selectedModels[p] = uniqueModels.filter(mId => 
            AVAILABLE_MODELS[p] && AVAILABLE_MODELS[p].some(m => m.id === mId)
          );
        }
      }
    }
  } catch(e) {}
  
  if (activeTabId) state.activeTabId = activeTabId;

  // Sync UI
  renderModelCarousel();
}

/* =========================================================
   FILE UPLOAD
   ========================================================= */

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

function handleFile(file) {
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

function resetFile() {
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

function setHint(msg) {
  el.hintText.textContent = msg;
}

function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}

/* =========================================================
   IMAGE
   ========================================================= */

function loadImage(file) {
  const url = URL.createObjectURL(file);
  el.imgPreview.src = url;
  el.imgPreview.onload = () => URL.revokeObjectURL(url);
}

/* =========================================================
   PDF — PDF.js
   ========================================================= */

async function loadPDF(file) {
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

async function renderPDFPage(n) {
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

/* =========================================================
   SELECTION — Draw / Move / Resize
   ========================================================= */

/**
 * We listen to pointer events on the overlay.
 * Children (.sel-box, .sel-handle) stop propagation for
 * move/resize so we know when to start a fresh draw.
 */

el.selOverlay.addEventListener("mousedown", onOverlayDown);
document.addEventListener("mousemove", onMouseMove);
document.addEventListener("mouseup", onMouseUp);

// Move existing selection
el.selBox.addEventListener("mousedown", (e) => {
  if (e.target.classList.contains("sel-handle")) return; // handled below
  e.stopPropagation();
  sel.mode = "move";
  sel.startX = e.clientX;
  sel.startY = e.clientY;
  sel.origX = sel.x;
  sel.origY = sel.y;
  el.selBox.style.cursor = "grabbing";
});

// Resize via handle
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

function onOverlayDown(e) {
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

function onMouseMove(e) {
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

function onMouseUp() {
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

/**
 * Compute new x/y/w/h when dragging a resize handle.
 */
function resizeFromHandle(dir, dx, dy, overlayRect) {
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

// Ensure handles have correct initial state
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

/**
 * Apply the current sel.x/y/w/h to the DOM.
 */
function renderSelection() {
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

function updateDimLabel() {
  let label = el.selBox.querySelector(".sel-dimensions");
  if (!label) {
    label = document.createElement("div");
    label.className = "sel-dimensions";
    el.selBox.prepend(label);
  }
  label.textContent = `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
}

function hideMasks() {
  [el.maskTop, el.maskBottom, el.maskLeft, el.maskRight].forEach((m) => {
    m.style.display = "none";
  });
}

function clearSelection() {
  sel.active = false;
  sel.mode = null;
  sel.x = 0;
  sel.y = 0;
  sel.w = 0;
  sel.h = 0;
  el.selBox.classList.add("hidden");
  hideMasks();
}

el.clearSelBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  clearSelection();
  setHint("Drag on the image to select a question");
});

/* =========================================================
   CROP THE SELECTED REGION → base64 PNG
   ========================================================= */

/**
 * Determine the source media element and compute
 * the crop rectangle in its natural pixel space.
 * Returns base64 PNG string (no prefix).
 */
function cropSelectionToBase64() {
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

/* =========================================================
   MODEL SWITCHER
   ========================================================= */

function renderModelCarousel() {
  el.modelCarousel.innerHTML = "";
  
  const providers = [
    { id: "gemini", name: "Gemini", icon: "gemini.svg" },
    { id: "ollama", name: "Ollama", icon: "ollama.svg" },
    { id: "mistral", name: "Mistral", icon: "mistral.svg" },
    { id: "groq", name: "Groq", icon: "groq.svg" }
  ];

  let firstTabId = null;
  let activeTabExists = false;

  providers.forEach(p => {
    if (!state.enabledProviders[p.id]) return;
    
    state.selectedModels[p.id].forEach(modelId => {
      const modelInfo = AVAILABLE_MODELS[p.id].find(m => m.id === modelId) || { label: modelId };
      const tabId = `${p.id}:${modelId}`;
      if (!firstTabId) firstTabId = tabId;
      if (tabId === state.activeTabId) activeTabExists = true;

      const card = document.createElement("div");
      card.className = "model-card";
      if (tabId === state.activeTabId) card.classList.add("active");
      card.dataset.tabId = tabId;
      card.dataset.provider = p.id;
      card.dataset.modelId = modelId;

      card.innerHTML = `
        <div class="card-icon-wrap">
          <img src="https://unpkg.com/@lobehub/icons-static-svg@latest/icons/${p.icon}" class="card-logo" alt="${p.name}" />
        </div>
        <div class="card-info">
          <span class="card-label">${p.name}</span>
          <span class="card-sublabel">${modelInfo.label}</span>
        </div>
      `;

      card.addEventListener("click", () => {
        handleCarouselTabClick(tabId, p.id, modelId, card);
      });

      el.modelCarousel.appendChild(card);
    });
  });

  if (!activeTabExists) {
    state.activeTabId = firstTabId;
    if (firstTabId) localStorage.setItem("mathai-active-tab-id", state.activeTabId);
    else localStorage.removeItem("mathai-active-tab-id");
    const firstCard = el.modelCarousel.querySelector(".model-card");
    if (firstCard) firstCard.classList.add("active");
  }
}

function handleCarouselTabClick(newTabId, newProviderId, newModelId, cardEl) {
  if (newTabId === state.activeTabId) return;

  // Save current tab's state into cache
  if (state.isSolved) {
    state.answerCache[state.activeTabId] = {
      rawResponse: state.rawResponse,
      chatHistory: [...state.chatHistory],
      solutionHTML: el.solutionContent.innerHTML,
    };
  }

  state.activeTabId = newTabId;
  localStorage.setItem("mathai-active-tab-id", newTabId);

  // Update pills
  el.modelCarousel.querySelectorAll(".model-card").forEach(c => c.classList.remove("active"));
  cardEl.classList.add("active");
  cardEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  const pName = newProviderId.charAt(0).toUpperCase() + newProviderId.slice(1);

  // Check cache
  const cached = state.answerCache[newTabId];
  if (cached) {
    state.rawResponse = cached.rawResponse;
    state.chatHistory = cached.chatHistory;
    
    el.solutionContent.innerHTML = "";
    if (state.jobNodes[newTabId]) {
      el.solutionContent.appendChild(state.jobNodes[newTabId]);
    } else {
      el.solutionContent.innerHTML = cached.solutionHTML;
    }
    
    state.isSolved = true;
    setSolutionState("content");
    enableOutputBtns();
  } else if (state.runningJobs[newTabId] && state.jobNodes[newTabId]) {
    // Model is currently running, just switch DOM
    state.isSolved = false;
    setSolutionState("content");
    el.solutionContent.innerHTML = "";
    el.solutionContent.appendChild(state.jobNodes[newTabId]);
    disableOutputBtns();
    scrollToBottom();
  } else if (sel.active && sel.w >= MIN_SEL && sel.h >= MIN_SEL) {
    showToast(`Switching to ${pName} — analyzing…`);
    el.errorActions.classList.add("hidden");
    solveSelection(false);
  }
}

function initMobileSolutionHeaderInlineScroll() {
  const header = document.querySelector(".solution-header");
  const solutionBody = document.getElementById("solutionBody");
  if (!header || !solutionBody) return;

  const originalParent = header.parentElement;
  const originalNext = header.nextElementSibling;

  const restoreToOriginal = () => {
    if (!originalParent) return;
    if (originalNext && originalNext.parentElement === originalParent) {
      originalParent.insertBefore(header, originalNext);
    } else {
      originalParent.insertBefore(header, originalParent.firstChild);
    }
  };

  const sync = () => {
    if (isMobile()) {
      if (header.parentElement !== solutionBody) {
        solutionBody.insertBefore(header, solutionBody.firstChild);
      }
    } else {
      if (header.parentElement !== originalParent) {
        restoreToOriginal();
      }
    }
  };

  window.addEventListener("resize", sync, { passive: true });
  sync();
}

initMobileSolutionHeaderInlineScroll();

el.tryAgainBtn.addEventListener("click", () => {
  // Try again only re-runs for the current provider, keeping other providers' cached answers.
  solveSelection(false);
});

/* =========================================================
   AI SOLVE — Main dispatcher
   ========================================================= */

const SYSTEM_PROMPT = `You are an expert Math AI Tutor. Solve the question presented in the image.

Analyze the question carefully and structure your response EXACTLY in the following format.

**Explanation**
Provide a highly structured, step-by-step breakdown. Each step MUST start with a heading in the format: ### [Number]. [Brief Title]. Use $...$ for inline math and $$...$$ for equations.

### 1. [Brief Title/Action for Step 1]
[Calculation or logic for step 1.]

### 2. [Brief Title/Action for Step 2]
[Calculation or logic for step 2...]

(Continue with sequential ### headings until the solution is complete.)

**Answer**
State the final answer clearly in one short sentence (e.g., "The answer is a) 100").

Formatting Rules (CRITICAL):
- Start directly with "**Explanation**". Do not use any introductory filler.
- STEP HEADINGS: Every single step MUST begin with "### [Number]. [Title]". Example: "### 3. Calculate the Area".
- NO BOLD TITLES: Do not use "**" for step headings. Just the "###" prefix.
- NEWLINES: Every display math block ($$ ... $$) MUST be followed by EXACTLY TWO newlines (\n\n) before any following text.
- LaTeX: Ensure all math expressions are wrapped in proper LaTeX ($ for inline, $$ for block).
- Conciseness: Keep reasoning direct and math-focused.`;

el.solveSelBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  // "Solve" is a primary action that resets the entire answer cache for the selection.
  solveSelection(true);
});

el.solveAllBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  solveAllSelection();
});

async function solveAllSelection() {
  state.answerCache = {};
  state.runningJobs = {};
  state.jobNodes = {};
  const currentTabId = state.activeTabId;

  if (!sel.active || sel.w < MIN_SEL || sel.h < MIN_SEL) {
    showToast("Draw a selection first.");
    return;
  }

  const base64 = cropSelectionToBase64();
  if (!base64) {
    showToast("Could not capture the selection. Try again.");
    return;
  }

  const providersKeys = {
    gemini: state.apiKey,
    groq: state.groqApiKey,
    mistral: state.mistralApiKey,
    ollama: state.ollamaApiKey,
  };

  const toRun = [];
  Object.keys(providersKeys).forEach(p => {
    if (providersKeys[p] && state.enabledProviders[p]) {
      state.selectedModels[p].forEach(m => {
        toRun.push({ provider: p, model: m, tabId: `${p}:${m}` });
      });
    }
  });

  if (toRun.length === 0) {
    showToast("⚙️ Add at least one API key and enable models in Settings first.");
    openSettings();
    return;
  }

  setSolutionState("loading");
  disableOutputBtns();
  state.isSolved = false;
  el.solutionContent.innerHTML = "";
  el.errorActions.classList.add("hidden");
  el.loadingSubText.textContent = `All active models (${toRun.length}) are analyzing your selection…`;

  if (isMobile() && window.showPanel) {
    window.showPanel("solution");
  }

  setSolutionState("content");

  let overallDoneCount = 0;
  function updateHintWhenAllDone() {
    overallDoneCount++;
    if (overallDoneCount === toRun.length) {
      enableOutputBtns();
      setHint(
        "Done! " +
          (isMobile()
            ? "Switch to Solution tab to see the answers."
            : "Try switching models via tabs or drag a new selection."),
      );
    }
  }

  toRun.forEach(async ({ provider, model, tabId }) => {
    state.runningJobs[tabId] = true;
    
    let wrapper = document.createElement("div");
    wrapper.className = "job-wrapper";
    state.jobNodes[tabId] = wrapper;

    let thinkingIndicator = appendThinkingIndicator(wrapper);
    let aiMsg = document.createElement("div");
    aiMsg.className = "chat-msg-ai";
    wrapper.appendChild(aiMsg);

    if (tabId === state.activeTabId) {
      el.solutionContent.appendChild(wrapper);
    }

    let firstChunkReceived = false;
    const onChunk = (fullText, chunkText) => {
      if (!firstChunkReceived) {
        firstChunkReceived = true;
        if (thinkingIndicator && thinkingIndicator.parentNode)
          thinkingIndicator.remove();
      }
      renderMarkdown(fullText, aiMsg);
    };

    try {
      let response = "";
      let chatHist = [];

      if (provider === "gemini") {
        chatHist = [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: "image/jpeg", data: base64 } }],
          },
        ];
        response = await callGeminiChat(
          chatHist,
          state.apiKey,
          model,
          onChunk,
        );
      } else if (provider === "groq") {
        response = await callGroqChat(
          base64,
          state.groqApiKey,
          model,
          onChunk,
        );
        chatHist = [
          { role: "user", content: "[Image provided]" },
          { role: "assistant", content: response },
        ];
      } else if (provider === "mistral") {
        response = await callMistralChat(
          base64,
          state.mistralApiKey,
          model,
          onChunk,
        );
        chatHist = [
          { role: "user", content: "[Image provided]" },
          { role: "assistant", content: response },
        ];
      } else if (provider === "ollama") {
        response = await callOllamaChat(
          base64,
          state.ollamaApiKey,
          model,
          onChunk,
        );
        chatHist = [
          { role: "user", content: "[Image provided]" },
          { role: "assistant", content: response },
        ];
      }

      if (state.enableVisualization && response.trim().length > 0) {
        try {
          await renderVisualization(response, wrapper, tabId);
        } catch (e) {
          console.error(e);
        }
      }

      state.runningJobs[tabId] = false;
      state.answerCache[tabId] = {
        rawResponse: response,
        chatHistory: chatHist,
        solutionHTML: wrapper.innerHTML,
      };

      if (tabId === state.activeTabId) {
        state.rawResponse = response;
        state.chatHistory = [...chatHist];
        state.isSolved = true;
      }
      updateHintWhenAllDone();
    } catch (err) {
      console.error("All-models AI error [" + tabId + "]:", err);
      const errHtml = getErrorHtml(
        "Failed to analyze (" + tabId + ")",
        err.message || "Unknown error",
      );

      state.runningJobs[tabId] = false;
      if (thinkingIndicator && thinkingIndicator.parentNode)
        thinkingIndicator.remove();
      wrapper.insertAdjacentHTML("beforeend", errHtml);
      
      if (tabId === state.activeTabId) {
        setSolutionState("error");
        state.isSolved = false;
        el.errorActions.classList.remove("hidden");
        scrollToBottom();
      }
      state.answerCache[tabId] = {
        rawResponse: "",
        chatHistory: [],
        solutionHTML: wrapper.innerHTML,
      };
      updateHintWhenAllDone();
    }
  });

  if (isMobile()) {
    const tabSol = document.getElementById("tabSolution");
    if (tabSol) tabSol.click();
  }
}

/**
 * AI SOLVE — Main dispatcher
 * @param {boolean} resetGlobalCache - If true, clears answers for ALL providers (e.g. for a brand-new selection).
 *                                     If false, only overwrites the current provider's result (e.g. for "Try again").
 */
async function solveSelection(resetGlobalCache = false) {
  if (resetGlobalCache) {
    state.answerCache = {};
    state.runningJobs = {};
    state.jobNodes = {};
  }
  const currentTabId = state.activeTabId;
  if (!currentTabId) return;
  const [currentProvider, currentModel] = currentTabId.split(":");

  if (!sel.active || sel.w < MIN_SEL || sel.h < MIN_SEL) {
    showToast("Draw a selection first.");
    return;
  }

  // Validate provider has an API key
  const providerKey = {
    gemini: state.apiKey,
    groq: state.groqApiKey,
    mistral: state.mistralApiKey,
    ollama: state.ollamaApiKey,
  }[currentProvider];

  if (!providerKey) {
    const names = {
      gemini: "Gemini",
      groq: "Groq",
      mistral: "Mistral",
      ollama: "Ollama Cloud",
    };
    showToast(
      `⚙️ Add your ${names[currentProvider]} API key in Settings first.`,
    );
    openSettings();
    return;
  }

  const base64 = cropSelectionToBase64();
  if (!base64) {
    showToast("Could not capture the selection. Try again.");
    return;
  }

  setSolutionState("loading");
  disableOutputBtns();
  state.isSolved = false;
  el.solutionContent.innerHTML = "";
  el.errorActions.classList.add("hidden");

  const providerNames = {
    gemini: "Gemini",
    groq: "Groq",
    mistral: "Mistral",
    ollama: "Ollama",
  };

  el.loadingSubText.textContent = `${providerNames[currentProvider]} is analyzing your selection…`;
  if (isMobile() && window.showPanel) {
    window.showPanel("solution");
  }

  let response = "";
  let wrapper = document.createElement("div");
  wrapper.className = "job-wrapper";
  let thinkingIndicator = null;
  state.jobNodes[currentTabId] = wrapper;

  try {
    state.runningJobs[currentTabId] = true;

    // Create the container where chunks will go right away
    setSolutionState("content");
    el.solutionContent.innerHTML = "";
    el.solutionContent.appendChild(wrapper);
    
    thinkingIndicator = appendThinkingIndicator(wrapper);
    const aiMsg = document.createElement("div");
    aiMsg.className = "chat-msg-ai";
    wrapper.appendChild(aiMsg);

    let firstChunkReceived = false;
    const onChunk = (fullText, chunkText) => {
      if (!firstChunkReceived) {
        firstChunkReceived = true;
        if (thinkingIndicator && thinkingIndicator.parentNode) thinkingIndicator.remove();
      }
      renderMarkdown(fullText, aiMsg);
    };

    if (currentProvider === "gemini") {
      state.chatHistory = [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: "image/jpeg", data: base64 } }],
        },
      ];
      response = await callGeminiChat(
        state.chatHistory,
        state.apiKey,
        currentModel,
        onChunk,
      );
    } else if (currentProvider === "groq") {
      response = await callGroqChat(
        base64,
        state.groqApiKey,
        currentModel,
        onChunk,
      );
      state.chatHistory = [
        { role: "user", content: "[Image provided]" },
        { role: "assistant", content: response },
      ];
    } else if (currentProvider === "mistral") {
      response = await callMistralChat(
        base64,
        state.mistralApiKey,
        currentModel,
        onChunk,
      );
      state.chatHistory = [
        { role: "user", content: "[Image provided]" },
        { role: "assistant", content: response },
      ];
    } else if (currentProvider === "ollama") {
      response = await callOllamaChat(
        base64,
        state.ollamaApiKey,
        currentModel,
        onChunk,
      );
      state.chatHistory = [
        { role: "user", content: "[Image provided]" },
        { role: "assistant", content: response },
      ];
    }

    if (state.enableVisualization && response.trim().length > 0) {
      try {
        await renderVisualization(response, wrapper, currentTabId);
      } catch (e) {
        console.error(e);
      }
    }

    state.runningJobs[currentTabId] = false;

    if (thinkingIndicator && thinkingIndicator.parentNode)
      thinkingIndicator.remove();

    state.answerCache[currentTabId] = {
      rawResponse: response,
      chatHistory: [...state.chatHistory],
      solutionHTML: wrapper.innerHTML,
    };

    if (state.activeTabId === currentTabId) {
      state.rawResponse = response;
      state.isSolved = true;
    }

    enableOutputBtns();
    setHint(
      "Done! " +
        (isMobile()
          ? "Switch to Solution tab to see the answer."
          : "Drag a new selection or ask a follow-up question below."),
    );

    if (isMobile()) {
      const tabSol = document.getElementById("tabSolution");
      if (tabSol) tabSol.click();
    }
  } catch (err) {
    state.runningJobs[currentTabId] = false;
    if (thinkingIndicator && thinkingIndicator.parentNode)
      thinkingIndicator.remove();
      
    wrapper.insertAdjacentHTML(
      "beforeend",
      getErrorHtml("AI request failed", err.message || "Something went wrong.")
    );

    state.answerCache[currentTabId] = {
      rawResponse: "",
      chatHistory: [],
      solutionHTML: wrapper.innerHTML,
    };

    if (state.activeTabId === currentTabId) {
      setSolutionState("error");
      state.isSolved = false;
      el.errorActions.classList.remove("hidden");
      scrollToBottom();
    }
    
    console.error("AI error:", err);
    setHint("Something went wrong. Try again.");
  }
}

// Handle follow-up chat
el.chatSendBtn.addEventListener("click", sendFollowUp);
el.chatRegenerateBtn.addEventListener("click", () => {
  // Retrying the entire selection run for the active tab
  solveSelection(false);
});
el.chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendFollowUp();
});

async function sendFollowUp() {
  const currentTabId = state.activeTabId;
  if (!currentTabId) return;
  const [currentProvider, currentModel] = currentTabId.split(":");
  const text = el.chatInput.value.trim();
  if (!text) return;
  el.chatInput.value = "";

  const providerKey = {
    gemini: state.apiKey,
    groq: state.groqApiKey,
    mistral: state.mistralApiKey,
    ollama: state.ollamaApiKey,
  }[currentProvider];

  disableOutputBtns();

  let response;
  let wrapper = state.jobNodes[currentTabId];
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "job-wrapper";
    wrapper.innerHTML = el.solutionContent.innerHTML;
    state.jobNodes[currentTabId] = wrapper;
  }
  let thinkingIndicator = null;

  try {
    state.runningJobs[currentTabId] = true;

    if (!document.body.contains(wrapper)) {
      el.solutionContent.innerHTML = "";
      el.solutionContent.appendChild(wrapper);
    } else {
      if (!el.solutionContent.contains(wrapper) && currentTabId === state.activeTabId) {
        el.solutionContent.appendChild(wrapper);
      }
    }

    appendUserMessage(text, wrapper);

    // Append thinking indicator
    thinkingIndicator = appendThinkingIndicator(wrapper);

    // Create the container for the AI message right away
    const aiMsg = document.createElement("div");
    aiMsg.className = "chat-msg-ai";
    wrapper.appendChild(aiMsg);

    let firstChunkReceived = false;
    const onChunk = (fullText, chunkText) => {
      if (!firstChunkReceived) {
        firstChunkReceived = true;
        if (thinkingIndicator && thinkingIndicator.parentNode) thinkingIndicator.remove();
      }
      renderMarkdown(fullText, aiMsg);
    };

    if (currentProvider === "gemini") {
      state.chatHistory.push({ role: "user", parts: [{ text }] });
      response = await callGeminiChat(
        state.chatHistory,
        providerKey,
        currentModel,
        onChunk,
      );
      state.chatHistory.push({ role: "model", parts: [{ text: response }] });
    } else if (currentProvider === "groq") {
      state.chatHistory.push({ role: "user", content: text });
      response = await callGroqFollowUp(
        state.chatHistory,
        providerKey,
        currentModel,
        onChunk,
      );
      state.chatHistory.push({ role: "assistant", content: response });
    } else if (currentProvider === "mistral") {
      state.chatHistory.push({ role: "user", content: text });
      response = await callMistralFollowUp(
        state.chatHistory,
        providerKey,
        currentModel,
        onChunk,
      );
      state.chatHistory.push({ role: "assistant", content: response });
    } else if (currentProvider === "ollama") {
      state.chatHistory.push({ role: "user", content: text });
      response = await callOllamaFollowUp(
        state.chatHistory,
        providerKey,
        currentModel,
        onChunk,
      );
      state.chatHistory.push({ role: "assistant", content: response });
    }

    if (state.enableVisualization && response.trim().length > 0) {
      try {
        await renderVisualization(response, wrapper, currentTabId);
      } catch (e) {
        console.error(e);
      }
    }

    state.rawResponse += "\n\n" + response;

    state.runningJobs[currentTabId] = false;

    // Update cache
    if (state.answerCache[currentTabId]) {
      state.answerCache[currentTabId].rawResponse = state.rawResponse;
      state.answerCache[currentTabId].chatHistory = [...state.chatHistory];
      state.answerCache[currentTabId].solutionHTML = wrapper.innerHTML;
    }
  } catch (err) {
    state.runningJobs[currentTabId] = false;
    wrapper.querySelectorAll(".chat-msg-thinking").forEach((el) => el.remove());
    wrapper.insertAdjacentHTML(
      "beforeend",
      getErrorHtml(
        "Follow-up request failed",
        err.message || "Something went wrong.",
      ),
    );
    if (currentTabId === state.activeTabId) {
      scrollToBottom();
    }
    console.error(err);
  } finally {
    wrapper.querySelectorAll(".chat-msg-thinking").forEach((el) => el.remove());
    if (state.answerCache[currentTabId]) {
      state.answerCache[currentTabId].solutionHTML = wrapper.innerHTML;
    }
    enableOutputBtns();
  }
}

function appendThinkingIndicator(container = el.solutionContent) {
  const div = document.createElement("div");
  div.className = "chat-msg-thinking";
  div.innerHTML = `
    <span>AI is thinking</span>
    <div class="loading-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  container.appendChild(div);
  if (container === el.solutionContent) scrollToBottom();
  return div;
}

function getErrorHtml(title, message) {
  return `
    <div class="error-msg-box">
      <div class="error-msg-header">
        <img src="https://api.iconify.design/lucide:alert-circle.svg?color=%23ef4444" alt="Error" class="error-icon" />
        <span class="error-title">${title}</span>
      </div>
      <div class="error-msg-body">
        <p>${message}</p>
      </div>
    </div>
  `;
}

function appendErrorBox(container, title, message) {
  container.insertAdjacentHTML("beforeend", getErrorHtml(title, message));
  scrollToBottom();
}

/**
 * Multi-turn Gemini API call
 */
async function callGeminiChat(contents, apiKey, model, onChunk) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: contents,
    generationConfig: {
      temperature: 0.15,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  return processStream(res, onChunk, (chunk) => {
    return chunk?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  });
}

/**
 * Groq vision/text call — sends image as base64 in the content
 */
async function callGroqChat(base64, apiKey, model, onChunk) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  // Determine if this model likely supports vision
  const visionModels = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
  ];
  const supportsVision = visionModels.includes(model);

  let messages;
  if (supportsVision) {
    messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64}` },
          },
        ],
      },
    ];
  } else {
    messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "[Image context provided as base64 but model has no vision]",
          },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64}` },
          },
        ],
      },
    ];
  }

  const body = {
    model,
    messages,
    temperature: 0.25,
    max_tokens: 8192,
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
  }

  return processStream(res, onChunk, (chunk) => {
    return chunk?.choices?.[0]?.delta?.content || "";
  });
}

/**
 * Groq follow-up (text-only conversation)
 */
async function callGroqFollowUp(messages, apiKey, model, onChunk) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const fullMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];
  const body = {
    model,
    messages: fullMessages,
    temperature: 0.15,
    max_tokens: 8192,
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
  }
  return processStream(res, onChunk, (chunk) => {
    return chunk?.choices?.[0]?.delta?.content || "";
  });
}

/**
 * Mistral vision call — Pixtral models support vision
 */
async function callMistralChat(base64, apiKey, model, onChunk) {
  const url = "https://api.mistral.ai/v1/chat/completions";

  // Pixtral models support vision
  const visionModels = ["pixtral-large-latest", "pixtral-12b-2409"];
  const supportsVision = visionModels.includes(model);

  let content;
  if (supportsVision) {
    content = [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "image_url", image_url: `data:image/png;base64,${base64}` },
    ];
  } else {
    // For text-only Mistral models, we can still pass image_url format
    // (Mistral API handles it gracefully or ignores non-vision-capable parts)
    content = [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "image_url", image_url: `data:image/png;base64,${base64}` },
    ];
  }

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0.15,
    max_tokens: 8192,
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Mistral HTTP ${res.status}`);
  }

  return processStream(res, onChunk, (chunk) => {
    return chunk?.choices?.[0]?.delta?.content || "";
  });
}

/**
 * Mistral follow-up (text conversation)
 */
async function callMistralFollowUp(messages, apiKey, model, onChunk) {
  const url = "https://api.mistral.ai/v1/chat/completions";
  // Convert content arrays to strings for follow-up
  const cleanMessages = messages.map((m) => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(" ")
      : m.content,
  }));
  const body = {
    model,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...cleanMessages],
    temperature: 0.15,
    max_tokens: 8192,
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Mistral HTTP ${res.status}`);
  }
  return processStream(res, onChunk, (chunk) => {
    return chunk?.choices?.[0]?.delta?.content || "";
  });
}

/**
 * Ollama generic OpenAPI call logic
 */
async function callOllamaChat(base64, apiKey, model, onChunk) {
  const url = `/api/ollama`;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: "Please solve the question in this image.",
      images: [base64],
    },
  ];

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body = {
    model,
    messages,
    stream: true,
    options: { temperature: 0.25 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Ollama Cloud HTTP ${res.status}`);
  }

  return processStream(res, onChunk, (chunk) => {
    return chunk?.message?.content || "";
  });
}

async function callOllamaFollowUp(messages, apiKey, model, onChunk) {
  const url = `/api/ollama`;
  const cleanMessages = messages.map((m) => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(" ")
      : m.content,
  }));
  const fullMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...cleanMessages,
  ];
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body = {
    model,
    messages: fullMessages,
    stream: true,
    options: { temperature: 0.15 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Ollama Cloud HTTP ${res.status}`);
  }
  return processStream(res, onChunk, (chunk) => {
    return chunk?.message?.content || "";
  });
}

/* =========================================================
   RENDER SOLUTION — Markdown + KaTeX
   ========================================================= */

const renderQueueMap = new WeakMap();
const RENDER_THROTTLE_MS = 100;

function renderMarkdown(raw, container) {
  let state = renderQueueMap.get(container);
  if (!state) {
    state = { pendingRaw: null, isRendering: false, lastRenderTime: 0, timerId: null };
    renderQueueMap.set(container, state);
  }

  state.pendingRaw = raw;

  const executeRender = () => {
    if (state.pendingRaw === null) return;
    
    state.isRendering = true;
    const textToRender = state.pendingRaw;
    state.pendingRaw = null;

    let processed = textToRender;

    // Auto-close unclosed blocks to prevent formatting glitches during streaming
    const numBackticks = (processed.match(/```/g) || []).length;
    if (numBackticks % 2 !== 0) processed += "\n```";

    const numDoubleDollar = (processed.match(/\$\$/g) || []).length;
    if (numDoubleDollar % 2 !== 0) processed += "\n$$";

    const numOpenBracket = (processed.match(/\\\[/g) || []).length;
    const numCloseBracket = (processed.match(/\\\]/g) || []).length;
    if (numOpenBracket > numCloseBracket) processed += "\n\\]";

    // Convert ```math code blocks to standard $$ math blocks
    processed = processed.replace(
      /```math\n?([\s\S]*?)```/g,
      (match, p1) => `$$${p1}$$`,
    );

    const escapeHTML = (str) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Protect $$ ... $$ from being mangled by marked's breaks:true
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      return `\n<div class="math-block">${escapeHTML(match)}</div>\n`;
    });

    // Protect \[ ... \] blocks as well
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match) => {
      return `\n<div class="math-block">${escapeHTML(match)}</div>\n`;
    });

    marked.setOptions({ breaks: true, gfm: true });
    container.innerHTML = marked.parse(processed);

    if (typeof renderMathInElement !== "undefined") {
      renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
      });
    }

    state.lastRenderTime = Date.now();
    state.isRendering = false;

    if (container === el.solutionContent || el.solutionContent.contains(container)) {
      scrollToBottom(false);
    }

    if (state.pendingRaw !== null) {
      state.timerId = setTimeout(() => {
        requestAnimationFrame(executeRender);
      }, RENDER_THROTTLE_MS);
    }
  };

  if (state.isRendering) return;

  const now = Date.now();
  const timeSinceLast = now - state.lastRenderTime;

  if (timeSinceLast >= RENDER_THROTTLE_MS) {
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
    requestAnimationFrame(executeRender);
  } else {
    if (!state.timerId) {
      state.timerId = setTimeout(() => {
        state.timerId = null;
        requestAnimationFrame(executeRender);
      }, RENDER_THROTTLE_MS - timeSinceLast);
    }
  }
}

function renderSolution(raw) {
  setSolutionState("content");
  el.solutionContent.innerHTML = "";

  const aiMsg = document.createElement("div");
  aiMsg.className = "chat-msg-ai";
  el.solutionContent.appendChild(aiMsg);
  renderMarkdown(raw, aiMsg);

  el.solutionContent.parentElement.scrollTop = 0;
}

function appendUserMessage(text, container = el.solutionContent) {
  const userMsg = document.createElement("div");
  userMsg.className = "chat-msg-user";
  userMsg.textContent = text;
  container.appendChild(userMsg);
  if (container === el.solutionContent || el.solutionContent.contains(container)) {
    scrollToBottom();
  }
}

function appendAIMessage(raw) {
  const aiMsg = document.createElement("div");
  aiMsg.className = "chat-msg-ai";
  el.solutionContent.appendChild(aiMsg);
  renderMarkdown(raw, aiMsg);
}

function scrollToBottom(force = true) {
  const parent = el.solutionContent.parentElement;
  if (!parent) return;

  if (!force && state.isUserScrolledUp) {
    // User is manually scrolling up, do not force scroll down
    return;
  }
  parent.scrollTop = parent.scrollHeight;
}

/**
 * Process an SSE or NDJSON stream response
 */
async function processStream(response, onChunk, parser) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let done = false;
  let fullText = "";
  let buffer = "";

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep the last incomplete line in buffer

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // Strip "data: " prefix for SSE
        if (line.startsWith("data: ")) {
          line = line.substring(6);
        }

        if (line === "[DONE]") continue; // OpenAI end token

        try {
          const parsed = JSON.parse(line);
          const chunkText = parser(parsed);
          if (chunkText) {
            fullText += chunkText;
            if (onChunk) onChunk(fullText, chunkText);
          }
        } catch (e) {
          // Ignore incomplete JSON chunks or comments
        }
      }
    }
  }
  return fullText;
}

/* =========================================================
   OUTPUT BUTTONS
   ========================================================= */

el.copyBtn.addEventListener("click", () => {
  copyText(el.solutionContent.innerText || "");
});

el.copyLatexBtn.addEventListener("click", () => {
  if (!state.rawResponse) return;
  copyText(state.rawResponse);
  showToast("✓ LaTeX / Markdown source copied!");
});

el.downloadBtn.addEventListener("click", async () => {
  if (!state.rawResponse) return;

  try {
    showToast("⏳ Generating professional report…");

    // 1. Prepare data
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const currentTabId = state.activeTabId;
    if(!currentTabId) return;
    const [currentProvider, currentModel] = currentTabId.split(":");

    const providerNames = {
      gemini: "Gemini",
      groq: "Groq",
      mistral: "Mistral",
      ollama: "Ollama"
    };
    
    // 2. Populate template
    el.pdfDate.textContent = dateStr;
    el.pdfModel.textContent = `Model: ${providerNames[currentProvider]} ${currentModel}`;

    // Get high-quality crop
    const cropBase64 = cropSelectionToBase64();
    if (cropBase64) {
      el.pdfQuestionImg.src = `data:image/png;base64,${cropBase64}`;
    }

    // Clone solution content and clean up (remove animations, etc.)
    el.pdfSolutionContent.innerHTML = el.solutionContent.innerHTML;

    // Ensure math is rendered (it should be as we clone innerHTML, but sometimes KaTeX needs help)
    // Wait a bit for the image to load in the hidden template
    await new Promise((r) => setTimeout(r, 100));

    // 3. Generate PDF
    const opt = {
      margin: [10, 10],
      filename: `MathAI-Solution-${now.getTime()}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        backgroundColor: "#ffffff",
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    };

    // Temporarily show the template (but off-screen or zero height) for capturing
    // html2pdf works best if the element is in the DOM and visible (but can be hidden via clip/position)
    el.pdfTemplate.classList.remove("hidden");

    await html2pdf().set(opt).from(el.pdfTemplate).save();

    el.pdfTemplate.classList.add("hidden");
    showToast("✓ Solution report saved!");
  } catch (err) {
    showToast("PDF generation failed.");
    console.error("PDF Error:", err);
    el.pdfTemplate.classList.add("hidden");
  }
});

/* =========================================================
   PANEL RESIZE (drag divider)
   ========================================================= */

(function initPanelResize() {
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
})();

/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

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

/* =========================================================
   MOBILE — Tab Bar, Touch Selection, FAB
   ========================================================= */

(function initMobile() {
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

  tabViewer.addEventListener("click", () => showPanel("viewer"));
  tabSolution.addEventListener("click", () => showPanel("solution"));

  // Ensure start on viewer tab on mobile
  if (isMobile()) {
    showPanel("viewer");
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
      showPanel("viewer");
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

  /* ── After file loaded: auto-switch to viewer tab ───── */
  const _origHandleFile = handleFile;
  // Patch hint on handleFile completion for mobile
  const _origSetHint = setHint;

  /* ── After solve: switch to solution tab on mobile ───── */
  // Wrap solveSelection to auto-navigate on mobile
  const _origSolve = window.solveSelection;

  /* ── Window resize: reset panel visibility on desktop ── */
  window.addEventListener("resize", () => {
    if (!isMobile()) {
      leftPanel.classList.remove("panel-hidden");
      rightPanel.classList.remove("panel-hidden");
      mobileSolveBtn.classList.add("hidden");
    } else {
      // Re-apply current tab
      showPanel(activeTab);
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
})();

/* =========================================================
   INIT
   ========================================================= */

function waitForKaTeX(cb, n = 0) {
  if (typeof renderMathInElement !== "undefined") cb();
  else if (n < 40) setTimeout(() => waitForKaTeX(cb, n + 1), 250);
}

function init() {
  initTheme();
  loadSettings();
  setSolutionState("empty");
  disableOutputBtns();

  if (el.solutionContent && el.solutionContent.parentElement) {
    el.solutionContent.parentElement.addEventListener("scroll", () => {
      const parent = el.solutionContent.parentElement;
      // If we are within 60px of the bottom, consider it not scrolled up
      state.isUserScrolledUp = (parent.scrollHeight - parent.scrollTop - parent.clientHeight) > 60;
    }, { passive: true });
  }

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
/* =========================================================
   PYODIDE - AI Visualization
   ========================================================= */

let pyodideWorker = null;

function getPyodideWorker() {
  if (pyodideWorker) return pyodideWorker;
  
  const workerCode = `
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyInit = null;
async function getPy() {
  if (!pyInit) {
    pyInit = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/" }).then(async py => {
      await py.loadPackage(['matplotlib', 'numpy']);
      return py;
    });
  }
  return await pyInit;
}

  self.onmessage = async (e) => {
  const { id, code } = e.data;
  try {
    const py = await getPy();
    
    // Clear out any old output
    if (py.FS.analyzePath('output.png').exists) {
      py.FS.unlink('output.png');
    }

    try {
      // Inject monkey patch to gracefully swallow MathText Pyparsing errors on a per-label basis
      // Also force 'Agg' backend to avoid DOM access in Web Worker
      const robustCode = \`
import matplotlib
matplotlib.use('Agg')
import matplotlib.text as mtext
if not hasattr(mtext.Text, '_original_get_layout'):
    mtext.Text._original_get_layout = mtext.Text._get_layout
    def safe_get_layout(self, renderer):
        try:
            return self._original_get_layout(renderer)
        except Exception:
            self.set_text(self.get_text().replace('$', ''))
            return self._original_get_layout(renderer)
    mtext.Text._get_layout = safe_get_layout
\` + "\\n" + code;
      
      await py.runPythonAsync(robustCode);
    } catch (innerErr) {
      if (innerErr.message && innerErr.message.includes("ParseFatalException")) {
        // Fallback: retry without LaTeX mapping to prevent visualization failing on mathtext parses
        const fallbackCode = \`
import matplotlib
matplotlib.use('Agg')
\` + "\\n" + code.split("$").join("");
        await py.runPythonAsync(fallbackCode);
      } else {
        throw innerErr;
      }
    }
    
    if (py.FS.analyzePath('output.png').exists) {
      const imgData = py.FS.readFile('output.png');
      const uint8 = new Uint8Array(imgData);
      py.FS.unlink('output.png');
      self.postMessage({ id, success: true, imgData: uint8 }, [uint8.buffer]);
    } else {
      self.postMessage({ id, success: false, error: "Code ran but did not yield output.png" });
    }
  } catch (err) {
    self.postMessage({ id, success: false, error: err.message });
  }
};
  `;
  
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  pyodideWorker = new Worker(URL.createObjectURL(blob));
  return pyodideWorker;
}

function runPythonInWorker(code) {
  return new Promise((resolve, reject) => {
    const worker = getPyodideWorker();
    const id = Date.now() + Math.random().toString();
    
    const handler = (e) => {
      if (e.data.id === id) {
        worker.removeEventListener('message', handler);
        if (e.data.success) {
          resolve(e.data.imgData);
        } else {
          reject(new Error(e.data.error));
        }
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ id, code });
  });
}

async function renderVisualization(aiText, wrapper, tabId) {
  if (!state.enableVisualization) return;
  if (!state.visModelConfig) return;

  // Check if visualization is enabled for the current chat model
  const modelToCheck = tabId || state.activeTabId;
  if (!state.visEnabledModels.includes(modelToCheck)) return;

  const [visProvider, visModel] = state.visModelConfig.split(":");
  const providerKey = {
    gemini: state.apiKey,
    groq: state.groqApiKey,
    mistral: state.mistralApiKey,
    ollama: state.ollamaApiKey,
  }[visProvider];

  if (!providerKey) {
    console.warn("Skipping visualization: Missing API key for " + visProvider);
    return;
  }

          // Add loading UI component reference function
  const updateVisLoadingUI = (text) => {
    visContainer.innerHTML = `
      <div style="margin-top: 1.5rem; padding: 1rem; border: 1px dashed var(--border); border-radius: var(--radius-md); text-align: center; color: var(--text-secondary); background: var(--bg-tertiary);">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; width: 20px; height: 20px; vertical-align: -5px; margin-right: 8px;">
          <path d="M21 12a9 9 0 11-6.219-8.56"></path>
        </svg>
        <span style="font-size: 14px; font-weight: 500;">${text}</span>
      </div>
    `;
    scrollToBottom(true);
    if(typeof updateCache === 'function') updateCache();
  };

  const visContainer = document.createElement("div");
  visContainer.className = "vis-container";
  wrapper.appendChild(visContainer);

  const updateCache = () => {
    if (tabId && state.answerCache[tabId]) {
      state.answerCache[tabId].solutionHTML = wrapper.innerHTML;
    }
  };

  const startVisualization = async () => {
    try {
      const noop = () => {};

      // Generate TikZ directly from the main content
      updateVisLoadingUI(`Writing TikZ/PGFPlots code via ${visModel}...`);

      const coderPrompt = `You are an expert LaTeX TikZ and PGFPlots visualization coder. I am providing you with the step-by-step solution to a math problem.
Your task is to design a precise, publication-quality mathematical visualization for the QUESTION and the SETUP to solve the problem (including variables) using TikZ and PGFPlots. First make a plan how to visualize the question and the setup using the context below then start writing code following the rules. 

Context:
${aiText}

Rules for University-Level Textbook Aesthetics:
1. STRICT FORMATTING: ONLY output valid TikZ, PGFPlots code within a \`\`\`latex ... \`\`\` block. MUST start with \\begin{tikzpicture} and end with \\end{tikzpicture}.
2. PGFPLOTS VS TIKZ:
   - Use PGFPlots (\`\\begin{axis}...\`) for any function plots, data visualization, or coordinate-based graphs. Set \`axis lines=middle\`, \`xlabel\`, and \`ylabel\` for professional results.
   - Use TikZ commands (\`\\draw\`, \`\\node\`, etc.) for geometric diagrams, labels, and custom annotations.
   - You can combine them by nesting the \`axis\` environment inside the \`tikzpicture\`.
3. PROFESSIONAL STYLING:
   - Typography: Use $...$ for all mathematical text.
   - Colors: Use academic colors (black, blue!70!black, red!70!black).
   - Line Weights: Use \`thick\` for main curves/shapes and \`thin\` for grids/axes.
4. RELIABILITY:
   - Semicolons: Every TikZ, PGFPlots command MUST end with a semicolon (;).
   - Domains: Ensure PGFPlots domains don't cause math errors (e.g., negative values in sqrt).
   - Driver Compatibility: NEVER use \`shader=interp\`. It is not supported by our SVG renderer. Use \`shader=flat\`, \`shader=faceted\`, or standard coloring instead.
   - Preamble: Assume \\usepackage{pgfplots} and \\pgfplotsset{compat=1.18} are already in the preamble.`;

      let visCodeText = "";
      if (visProvider === "gemini") {
        const chatHist = [{ role: "user", parts: [{ text: coderPrompt }] }];
        visCodeText = await callGeminiChat(chatHist, providerKey, visModel, noop);
      } else if (visProvider === "groq") {
        visCodeText = await callGroqFollowUp([{ role: "user", content: coderPrompt }], providerKey, visModel, noop);
      } else if (visProvider === "mistral") {
        visCodeText = await callMistralFollowUp([{ role: "user", content: coderPrompt }], providerKey, visModel, noop);
      } else if (visProvider === "ollama") {
        visCodeText = await callOllamaFollowUp([{ role: "user", content: coderPrompt }], providerKey, visModel, noop);
      }
      
      // Extract TikZ code
      let tikzCode = "";
      
      // Always prefer explicit begin/end environment to strip preamble if AI added one
      const beginIdx = visCodeText.indexOf("\\begin{tikzpicture}");
      const endIdx = visCodeText.lastIndexOf("\\end{tikzpicture}");
      
      if (beginIdx !== -1 && endIdx !== -1) {
          tikzCode = visCodeText.substring(beginIdx, endIdx + "\\end{tikzpicture}".length);
      } else {
          const tikzRegex = /\`\`\`(?:latex|tikz)?\n([\s\S]*?)\`\`\`/;
          const tikzMatch = tikzRegex.exec(visCodeText);
          if (tikzMatch && tikzMatch[1].trim().length > 0) {
            tikzCode = tikzMatch[1].trim();
        } else {
          tikzCode = visCodeText.replace(/\`\`\`/g, "").trim(); 
        }
    }

    if (!tikzCode || !tikzCode.includes("\\begin{tikzpicture}")) {
       throw new Error("The AI model failed to produce valid TikZ code. Please try again.");
    }

    updateVisLoadingUI("Rendering TikZ/PGFPlots via Web API...");
    
    let safeTikz = tikzCode.replace(/\\documentclass.*?\n/g, '').replace(/\\usepackage.*?\n/g, '').replace(/\\begin{document}/g, '').replace(/\\end{document}/g, '');
    const printCode = `\\documentclass[tikz,border=2pt]{standalone}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{xcolor}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usetikzlibrary{calc,angles,quotes,intersections,positioning,arrows.meta,decorations.markings,backgrounds}
\\begin{document}
${safeTikz}
\\end{document}`;

    const svgResp = await fetch("https://kroki.io/tikz/svg", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: printCode,
      // optional short timeout
    });

    if (!svgResp.ok) {
      const errText = await svgResp.text();
      console.error("Kroki Error Response:", errText);
      const cleanErr = errText.split("\n").slice(0, 5).join(" ").replace(/</g, "&lt;");
      throw new Error("TikZ compilation error:\n" + cleanErr);
    }
    
    const svgText = await svgResp.text();

    const visualDiv = document.createElement("div");
    visualDiv.style.cssText = "margin-top: 1.5rem; text-align: center; overflow-x: auto; background: transparent;";
    
    visualDiv.innerHTML = svgText;
    
    // adjust SVG max size so it doesn't break chat layout
    const svgEl = visualDiv.querySelector("svg");
    if(svgEl) {
       svgEl.style.maxWidth = "100%";
       svgEl.style.height = "auto";
    }

    visContainer.innerHTML = ""; // Clear loading state
    visContainer.appendChild(visualDiv);

    // Add Regenerate button below visualization
    const regenWrapper = document.createElement("div");
    regenWrapper.style.cssText = "margin-top: 12px; text-align: center;";
    
    const regenBtn = document.createElement("button");
    regenBtn.className = "btn btn-outline btn-sm";
    regenBtn.title = "Regenerate only this visualization image";
    regenBtn.style.cssText = "font-size: 12px; padding: 6px 12px; border-radius: var(--radius-md); opacity: 0.85;";
    regenBtn.innerHTML = `
      <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; margin-right: 4px;">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
        <path d="M3 3v5h5"></path>
      </svg>
      Regenerate Image
    `;
    regenBtn.addEventListener("click", () => {
      startVisualization();
    });
    
    regenWrapper.appendChild(regenBtn);
    visContainer.appendChild(regenWrapper);

    scrollToBottom(true);
    if(typeof updateCache === 'function') updateCache();

    } catch (err) {
      console.error("Visualization error:", err);
      let shortErr = err && err.message ? err.message.split("\\n")[0] : "Unknown error";
      visContainer.innerHTML = `
        <div style="margin-top: 1.5rem; padding: 0.85rem; border: 1px solid var(--danger); border-radius: var(--radius-md); color: var(--danger); font-size: 13px; background: rgba(239, 68, 68, 0.05); text-align: center;">
          <div style="font-weight: 500; margin-bottom: 6px;">Visualization generation failed.</div>
          <div style="opacity: 0.8; font-size: 11.5px; margin-bottom: 12px; word-break: break-all;">${shortErr.replace(/</g, "&lt;")}</div>
          <button class="btn btn-outline btn-sm" style="border-color: var(--danger); color: var(--danger); font-size: 12px; padding: 6px 12px; border-radius: var(--radius-md);">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; margin-right: 4px;">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            Try Again
          </button>
        </div>
      `;
      const retryBtn = visContainer.querySelector('button');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => startVisualization());
      }
      scrollToBottom(true);
      if(typeof updateCache === 'function') updateCache();
    }
  };

  if (state.visMode === "ask") {
    visContainer.innerHTML = `
      <div style="margin-top: 1.5rem; text-align: center;">
        <button class="btn btn-outline" id="btn-trigger-vis-${Date.now()}" style="padding: 10px 16px; border-radius: var(--radius-md); font-weight: 500;">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          Generate Visualization
        </button>
      </div>
    `;
    const triggerBtn = visContainer.querySelector('button');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => {
        startVisualization();
      });
    }
    scrollToBottom(true);
    if(typeof updateCache === 'function') updateCache();
  } else {
    // visMode auto
    startVisualization();
  }
}
