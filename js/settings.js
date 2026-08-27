import { AVAILABLE_MODELS } from './config.js';
import { state } from './state.js';
import { el } from './dom.js';
import { renderModelCarousel } from './carousel.js';
import { renderVisualization } from './visualization.js';

const PROVIDERS = [
  { id: "gemini", name: "Google Gemini", icon: "gemini.svg" },
  { id: "ollama", name: "Ollama Cloud", icon: "ollama.svg" },
  { id: "mistral", name: "Mistral AI", icon: "mistral.svg" },
  { id: "groq", name: "Groq", icon: "groq.svg" },
  { id: "openrouter", name: "OpenRouter", icon: "openrouter.svg" }
];

function providerLogo(p) { return p.id === "openrouter" ? "https://openrouter.ai/favicon.ico" : `https://unpkg.com/@lobehub/icons-static-svg@latest/icons/${p.icon}`; }

export function renderSettingsModels() {
  el.modelsView.innerHTML = "";
  PROVIDERS.forEach(p => {
    const enabled = state.enabledProviders[p.id];
    const header = document.createElement("div"); header.className = "settings-provider-header";
    header.innerHTML = `<div class="provider-header-left"><img src="${providerLogo(p)}" class="provider-logo" alt="${p.name}"><span>${p.name}</span></div><label class="toggle-switch"><input type="checkbox" class="provider-toggle" data-provider="${p.id}" ${enabled ? "checked" : ""}><span class="slider"></span></label>`;
    el.modelsView.appendChild(header);
    if (enabled && AVAILABLE_MODELS[p.id]) {
      const grid = document.createElement("div"); grid.className = "models-grid";
      AVAILABLE_MODELS[p.id].forEach(m => {
        const lbl = document.createElement("label"); lbl.className = "model-checkbox-label";
        lbl.innerHTML = `<input type="checkbox" class="model-checkbox" data-provider="${p.id}" value="${m.id}" ${state.selectedModels[p.id].includes(m.id) ? "checked" : ""}>${m.label}`;
        grid.appendChild(lbl);
      }); el.modelsView.appendChild(grid);
    }
    const divider = document.createElement("div"); divider.className = "settings-divider"; el.modelsView.appendChild(divider);
  });
  el.modelsView.querySelectorAll(".provider-toggle").forEach(cb => cb.addEventListener("change", e => {
    state.enabledProviders[e.target.dataset.provider] = e.target.checked; renderSettingsModels(); renderVisModels("coder"); renderVisModels("planner"); renderVisEnabledModels();
  }));
  el.modelsView.querySelectorAll(".model-checkbox").forEach(cb => cb.addEventListener("change", e => {
    const p = e.target.dataset.provider, val = e.target.value;
    if (e.target.checked) { if (!state.selectedModels[p].includes(val)) state.selectedModels[p].push(val); }
    else state.selectedModels[p] = state.selectedModels[p].filter(x => x !== val);
  }));
}

export function renderVisEnabledModels() {
  if (!el.visEnabledModelsContainer) return; el.visEnabledModelsContainer.innerHTML = "";
  PROVIDERS.forEach(p => {
    const selected = state.selectedModels[p.id] || [];
    if (!state.enabledProviders[p.id] || !selected.length || !AVAILABLE_MODELS[p.id]) return;
    const group = document.createElement("div"); group.className = "vis-provider-group"; group.style.marginBottom = "20px";
    const header = document.createElement("div"); header.className = "provider-header-left"; header.style.marginBottom = "10px"; header.innerHTML = `<img src="${providerLogo(p)}" class="provider-logo" style="width:18px;height:18px" alt="${p.name}"><span style="font-size:14px;font-weight:600;color:var(--text-secondary)">${p.name}</span>`; group.appendChild(header);
    const grid = document.createElement("div"); grid.className = "models-grid";
    selected.forEach(id => { const m = AVAILABLE_MODELS[p.id].find(x => x.id === id); if (!m) return; const val = `${p.id}:${id}`; const lbl = document.createElement("label"); lbl.className = "model-checkbox-label"; lbl.innerHTML = `<input type="checkbox" class="vis-model-checkbox" value="${val}" ${state.visEnabledModels.includes(val) ? "checked" : ""}>${m.label}`; grid.appendChild(lbl); });
    group.appendChild(grid); el.visEnabledModelsContainer.appendChild(group);
  });
  el.visEnabledModelsContainer.querySelectorAll(".vis-model-checkbox").forEach(cb => cb.addEventListener("change", e => { const v = e.target.value; if (e.target.checked) { if (!state.visEnabledModels.includes(v)) state.visEnabledModels.push(v); } else state.visEnabledModels = state.visEnabledModels.filter(x => x !== v); }));
}

export function renderVisModels(type = "coder") {
  const container = type === "planner" ? el.visPlannerModelsContainer : el.visModelsContainer; const current = type === "planner" ? state.visPlannerModelConfig : state.visModelConfig; const name = type === "planner" ? "visPlannerModelGlobalRadio" : "visModelGlobalRadio"; if (!container) return; container.innerHTML = "";
  PROVIDERS.forEach(p => {
    if (!state.enabledProviders[p.id] || !AVAILABLE_MODELS[p.id]) return;
    const group = document.createElement("div"); group.className = "vis-provider-group"; group.style.marginBottom = "20px";
    const header = document.createElement("div"); header.className = "provider-header-left"; header.style.marginBottom = "10px"; header.innerHTML = `<img src="${providerLogo(p)}" class="provider-logo" style="width:18px;height:18px" alt="${p.name}"><span style="font-size:14px;font-weight:600;color:var(--text-secondary)">${p.name}</span>`; group.appendChild(header);
    const grid = document.createElement("div"); grid.className = "models-grid";
    AVAILABLE_MODELS[p.id].forEach(m => { const val = `${p.id}:${m.id}`; const lbl = document.createElement("label"); lbl.className = "model-checkbox-label"; lbl.innerHTML = `<input type="radio" name="${name}" class="model-radio" value="${val}" ${current === val ? "checked" : ""}>${m.label}`; grid.appendChild(lbl); });
    group.appendChild(grid); container.appendChild(group);
  });
  container.querySelectorAll(".model-radio").forEach(r => r.addEventListener("change", e => { if (e.target.checked) { if (type === "planner") state.visPlannerModelConfig = e.target.value; else state.visModelConfig = e.target.value; } }));
}

function ensureOpenRouterKeyInput() {
  if (document.getElementById("openrouterApiKeyInput")) return;
  const section = document.createElement("div"); section.className = "settings-section"; section.id = "openrouterKeySection";
  section.innerHTML = `<div class="settings-provider-header"><img src="https://openrouter.ai/favicon.ico" class="provider-logo" alt="OpenRouter"><span>OpenRouter</span></div><label class="settings-label" for="openrouterApiKeyInput">API Key</label><div class="key-input-wrap"><input type="password" id="openrouterApiKeyInput" class="text-input" placeholder="sk-or-v1-…" autocomplete="off"><button type="button" id="openrouterKeyToggle" class="key-eye-btn" aria-label="Show API key">◉</button></div><p style="font-size:12px;color:var(--text-muted);margin-top:8px">Used for the free vision models listed under OpenRouter. The key is stored locally in your browser.</p>`;
  el.apiKeysView.appendChild(section);
  const input = section.querySelector("#openrouterApiKeyInput"); input.value = state.openrouterApiKey;
  input.addEventListener("input", () => { state.openrouterApiKey = input.value.trim(); if (state.openrouterApiKey) localStorage.setItem("mathai-openrouter-apikey", state.openrouterApiKey); else localStorage.removeItem("mathai-openrouter-apikey"); });
  section.querySelector("#openrouterKeyToggle").addEventListener("click", () => { input.type = input.type === "password" ? "text" : "password"; });
}

export function openSettings() {
  ensureOpenRouterKeyInput();
  el.apiKeyInput.value = state.apiKey; el.groqApiKeyInput.value = state.groqApiKey; el.mistralApiKeyInput.value = state.mistralApiKey; el.ollamaApiKeyInput.value = state.ollamaApiKey;
  if (el.enableVisualization) { el.enableVisualization.checked = state.enableVisualization; el.visModelsWrapper?.classList.toggle("hidden", !state.enableVisualization); }
  if (el.visEngineTikz && el.visEngineMatplotlib && el.visEngineSvg) { el.visEngineTikz.checked = state.visEngine === "tikz"; el.visEngineMatplotlib.checked = state.visEngine === "matplotlib"; el.visEngineSvg.checked = state.visEngine === "svg"; }
  if (el.visModeAsk && el.visModeAuto) { el.visModeAsk.checked = state.visMode === "ask"; el.visModeAuto.checked = state.visMode === "auto"; }
  if (el.enableVisPlanner) { el.enableVisPlanner.checked = state.enableVisPlanner; el.visPlannerModelsWrapper?.classList.toggle("hidden", !state.enableVisPlanner); }
  renderVisModels("coder"); renderVisModels("planner"); renderVisEnabledModels(); renderSettingsModels();
  el.settingsSt.classList.add("hidden"); el.settingsOv.classList.remove("hidden"); setTimeout(() => el.apiKeyInput.focus(), 80);
}
export function closeSettings() { el.settingsOv.classList.add("hidden"); }
export function showSettingsSt(msg, type) { el.settingsSt.textContent = msg; el.settingsSt.className = `settings-status ${type}`; el.settingsSt.classList.remove("hidden"); }

export function loadSettings() {
  const keys = { "mathai-apikey": "apiKey", "mathai-groq-apikey": "groqApiKey", "mathai-mistral-apikey": "mistralApiKey", "mathai-ollama-apikey": "ollamaApiKey", "mathai-openrouter-apikey": "openrouterApiKey" };
  Object.entries(keys).forEach(([storage, prop]) => { const v = localStorage.getItem(storage); if (v) state[prop] = v; });
  const ep = localStorage.getItem("mathai-enabled-providers"), sm = localStorage.getItem("mathai-selected-models"), active = localStorage.getItem("mathai-active-tab-id");
  const enableVis = localStorage.getItem("mathai-enable-vis"), engine = localStorage.getItem("mathai-vis-engine"), mode = localStorage.getItem("mathai-vis-mode"), visMod = localStorage.getItem("mathai-vis-model");
  if (enableVis !== null) state.enableVisualization = enableVis === "true"; if (engine) state.visEngine = engine; if (mode) state.visMode = mode; if (visMod) state.visModelConfig = visMod;
  const planner = localStorage.getItem("mathai-enable-vis-planner"), plannerMod = localStorage.getItem("mathai-vis-planner-model"), visList = localStorage.getItem("mathai-vis-enabled");
  if (planner !== null) state.enableVisPlanner = planner === "true"; if (plannerMod) state.visPlannerModelConfig = plannerMod; if (visList) { try { state.visEnabledModels = JSON.parse(visList); } catch {} }
  try {
    if (ep) { const parsed = JSON.parse(ep); Object.keys(state.enabledProviders).forEach(p => { if (parsed[p] !== undefined) state.enabledProviders[p] = !!parsed[p]; }); }
    if (sm) { const parsed = JSON.parse(sm); Object.keys(state.selectedModels).forEach(p => { if (Array.isArray(parsed[p])) state.selectedModels[p] = [...new Set(parsed[p])].filter(id => AVAILABLE_MODELS[p]?.some(m => m.id === id)); }); }
  } catch {}
  if (active) state.activeTabId = active;
  renderModelCarousel();
}

export function makeEyeToggle(btn, input) { btn.addEventListener("click", () => { const pw = input.type === "password"; input.type = pw ? "text" : "password"; btn.querySelector(".eye-open").classList.toggle("hidden", pw); btn.querySelector(".eye-closed").classList.toggle("hidden", !pw); }); }
