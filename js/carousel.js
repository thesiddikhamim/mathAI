import { AVAILABLE_MODELS } from './config.js';
import { state, sel } from './state.js';
import { showToast, scrollToBottom } from './utils.js';
import { MIN_SEL } from './config.js';
import { setSolutionState, enableOutputBtns, disableOutputBtns } from './ui-manager.js';
import { solveSelection } from './chat-engine.js';

const PROVIDERS = [
  { id: "gemini", name: "Gemini", icon: "gemini.svg" },
  { id: "ollama", name: "Ollama", icon: "ollama.svg" },
  { id: "mistral", name: "Mistral", icon: "mistral.svg" },
  { id: "groq", name: "Groq", icon: "groq.svg" },
  { id: "openrouter", name: "OpenRouter", icon: "openrouter.svg" }
];
const logo = p => p.id === "openrouter" ? "https://openrouter.ai/favicon.ico" : `https://unpkg.com/@lobehub/icons-static-svg@latest/icons/${p.icon}`;

export function renderModelCarousel() {
  el.modelCarousel.innerHTML = ""; let firstTabId = null; let activeTabExists = false;
  PROVIDERS.forEach(p => {
    if (!state.enabledProviders[p.id]) return;
    (state.selectedModels[p.id] || []).forEach(modelId => {
      const info = AVAILABLE_MODELS[p.id].find(m => m.id === modelId) || { label: modelId }; const tabId = `${p.id}:${modelId}`;
      if (!firstTabId) firstTabId = tabId; if (tabId === state.activeTabId) activeTabExists = true;
      const card = document.createElement("div"); card.className = "model-card"; if (tabId === state.activeTabId) card.classList.add("active"); card.dataset.tabId = tabId; card.dataset.provider = p.id; card.dataset.modelId = modelId;
      card.innerHTML = `<div class="card-icon-wrap"><img src="${logo(p)}" class="card-logo" alt="${p.name}"></div><div class="card-info"><span class="card-label">${p.name}</span><span class="card-sublabel">${info.label}</span></div>`;
      card.addEventListener("click", () => handleCarouselTabClick(tabId, p.id, modelId, card)); el.modelCarousel.appendChild(card);
    });
  });
  if (!activeTabExists) { state.activeTabId = firstTabId; if (firstTabId) localStorage.setItem("mathai-active-tab-id", firstTabId); else localStorage.removeItem("mathai-active-tab-id"); el.modelCarousel.querySelector(".model-card")?.classList.add("active"); }
}

export function handleCarouselTabClick(newTabId, newProviderId, newModelId, cardEl) {
  if (newTabId === state.activeTabId) return;
  if (state.isSolved) state.answerCache[state.activeTabId] = { rawResponse: state.rawResponse, chatHistory: [...state.chatHistory], solutionHTML: el.solutionContent.innerHTML };
  state.activeTabId = newTabId; localStorage.setItem("mathai-active-tab-id", newTabId);
  el.modelCarousel.querySelectorAll(".model-card").forEach(c => c.classList.remove("active")); cardEl.classList.add("active"); cardEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  const pName = PROVIDERS.find(p => p.id === newProviderId)?.name || newProviderId;
  const cached = state.answerCache[newTabId];
  if (cached) { state.rawResponse = cached.rawResponse; state.chatHistory = cached.chatHistory; el.solutionContent.innerHTML = ""; if (state.jobNodes[newTabId]) el.solutionContent.appendChild(state.jobNodes[newTabId]); else el.solutionContent.innerHTML = cached.solutionHTML; state.isSolved = true; setSolutionState("content"); enableOutputBtns(); }
  else if (state.runningJobs[newTabId] && state.jobNodes[newTabId]) { state.isSolved = false; setSolutionState("content"); el.solutionContent.innerHTML = ""; el.solutionContent.appendChild(state.jobNodes[newTabId]); disableOutputBtns(); scrollToBottom(); }
  else if (sel.active && sel.w >= MIN_SEL && sel.h >= MIN_SEL) { showToast(`Switching to ${pName} — analyzing…`); el.errorActions.classList.add("hidden"); solveSelection(false); }
}
