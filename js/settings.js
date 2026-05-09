import { AVAILABLE_MODELS } from './config.js';
import { state } from './state.js';
import { el } from './dom.js';
import { renderModelCarousel } from './carousel.js';
import { renderVisualization } from './visualization.js';

export function renderSettingsModels() {
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
      renderVisModels("coder");
      renderVisModels("planner");
      renderVisEnabledModels(); // re-render visualization models list
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

export function renderVisEnabledModels() {
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

export function renderVisModels(type = "coder") {
  const container = type === "planner" ? el.visPlannerModelsContainer : el.visModelsContainer;
  const currentConfig = type === "planner" ? state.visPlannerModelConfig : state.visModelConfig;
  const radioName = type === "planner" ? "visPlannerModelGlobalRadio" : "visModelGlobalRadio";

  if (!container) return;
  container.innerHTML = "";
  
  const providers = [
    { id: "gemini", name: "Google Gemini", icon: "gemini.svg" },
    { id: "ollama", name: "Ollama Cloud", icon: "ollama.svg" },
    { id: "mistral", name: "Mistral AI", icon: "mistral.svg" },
    { id: "groq", name: "Groq", icon: "groq.svg" }
  ];

  providers.forEach((p) => {
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
        const isSelected = currentConfig === val;
        
        const lbl = document.createElement("label");
        lbl.className = "model-checkbox-label";
        
        lbl.innerHTML = `
          <input type="radio" name="${radioName}" class="model-radio" value="${val}" ${isSelected ? "checked" : ""}>
          ${m.label}
        `;
        grid.appendChild(lbl);
      });
      
      group.appendChild(grid);
      container.appendChild(group);
    }
  });

  // Add event listeners for the radio buttons
  container.querySelectorAll(".model-radio").forEach(radio => {
    radio.addEventListener("change", e => {
      if (e.target.checked) {
        if (type === "planner") {
          state.visPlannerModelConfig = e.target.value;
        } else {
          state.visModelConfig = e.target.value;
        }
      }
    });
  });
}

export function openSettings() {
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

  if (el.enableVisPlanner) {
    el.enableVisPlanner.checked = state.enableVisPlanner;
    if (el.visPlannerModelsWrapper) {
      el.visPlannerModelsWrapper.classList.toggle("hidden", !state.enableVisPlanner);
    }
  }
  
  renderVisModels("coder");
  renderVisModels("planner");
  renderVisEnabledModels();
  
  renderSettingsModels();
  
  el.settingsSt.classList.add("hidden");
  el.settingsOv.classList.remove("hidden");
  setTimeout(() => el.apiKeyInput.focus(), 80);
}

export function closeSettings() {
  el.settingsOv.classList.add("hidden");
}

export function showSettingsSt(msg, type) {
  el.settingsSt.textContent = msg;
  el.settingsSt.className = `settings-status ${type}`;
  el.settingsSt.classList.remove("hidden");
}

export function loadSettings() {
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

  const enableVisPlanner = localStorage.getItem("mathai-enable-vis-planner");
  const visPlannerMod = localStorage.getItem("mathai-vis-planner-model");
  if (enableVisPlanner !== null) state.enableVisPlanner = enableVisPlanner === "true";
  if (visPlannerMod) state.visPlannerModelConfig = visPlannerMod;
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

export function makeEyeToggle(btn, input) {
  btn.addEventListener("click", () => {
    const pw = input.type === "password";
    input.type = pw ? "text" : "password";
    btn.querySelector(".eye-open").classList.toggle("hidden", pw);
    btn.querySelector(".eye-closed").classList.toggle("hidden", !pw);
  });
}
