import { state, sel } from './state.js';
import { el } from './dom.js';
import { MIN_SEL } from './config.js';
import { showToast, getErrorHtml, scrollToBottom } from './utils.js';
import { setSolutionState, enableOutputBtns, disableOutputBtns, isMobile, setHint } from './ui-manager.js';
import { cropSelectionToBase64, clearSelection, clearAttachment } from './selection.js';
import { appendThinkingIndicator, renderMarkdown, appendUserMessage } from './renderer.js';
import { callGeminiChat, callGroqChat, callMistralChat, callOllamaChat, callOpenRouterChat, callGroqFollowUp, callMistralFollowUp, callOllamaFollowUp, callOpenRouterFollowUp } from './ai-service.js';
import { renderVisualization } from './visualization.js';
import { openSettings } from './settings.js';

const providerKeys = () => ({ gemini: state.apiKey, groq: state.groqApiKey, mistral: state.mistralApiKey, ollama: state.ollamaApiKey, openrouter: state.openrouterApiKey });
const providerNames = { gemini: "Gemini", groq: "Groq", mistral: "Mistral", ollama: "Ollama Cloud", openrouter: "OpenRouter" };

async function callProviderImage(provider, base64, key, model, onChunk) {
  if (provider === "gemini") return callGeminiChat([{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: base64 } }] }], key, model, onChunk);
  if (provider === "groq") return callGroqChat(base64, key, model, onChunk);
  if (provider === "mistral") return callMistralChat(base64, key, model, onChunk);
  if (provider === "ollama") return callOllamaChat(base64, key, model, onChunk);
  if (provider === "openrouter") return callOpenRouterChat(base64, key, model, onChunk);
  throw new Error(`Unsupported provider: ${provider}`);
}

function initialHistory(provider, response) {
  if (provider === "gemini") return [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: "[image]" } }] }, { role: "model", parts: [{ text: response }] }];
  return [{ role: "user", content: "[Image provided]" }, { role: "assistant", content: response }];
}

export async function solveAllSelection() {
  state.answerCache = {}; state.runningJobs = {}; state.jobNodes = {};
  if (!sel.active || sel.w < MIN_SEL || sel.h < MIN_SEL) return showToast("Draw a selection first.");
  const base64 = cropSelectionToBase64();
  if (!base64) return showToast("Could not capture the selection. Try again.");
  const keys = providerKeys();
  const toRun = [];
  Object.keys(keys).forEach(p => {
    if (keys[p] && state.enabledProviders[p]) (state.selectedModels[p] || []).forEach(m => toRun.push({ provider: p, model: m, tabId: `${p}:${m}` }));
  });
  if (!toRun.length) { showToast("⚙️ Add at least one API key and enable models in Settings first."); openSettings(); return; }
  setSolutionState("loading"); disableOutputBtns(); state.isSolved = false; el.solutionContent.innerHTML = ""; el.errorActions.classList.add("hidden");
  el.loadingSubText.textContent = `All active models (${toRun.length}) are analyzing your selection…`;
  if (isMobile() && window.showPanel) window.showPanel("solution");
  setSolutionState("content");
  let done = 0;
  const finish = () => { done++; if (done === toRun.length) { enableOutputBtns(); setHint("Done! " + (isMobile() ? "Switch to Solution tab to see the answers." : "Try switching models via tabs or drag a new selection.")); } };
  toRun.forEach(async ({ provider, model, tabId }) => {
    state.runningJobs[tabId] = true;
    const wrapper = document.createElement("div"); wrapper.className = "job-wrapper"; state.jobNodes[tabId] = wrapper;
    const thinking = appendThinkingIndicator(wrapper); const aiMsg = document.createElement("div"); aiMsg.className = "chat-msg-ai"; wrapper.appendChild(aiMsg);
    if (tabId === state.activeTabId) el.solutionContent.appendChild(wrapper);
    let first = false; const onChunk = (fullText) => { if (!first) { first = true; thinking?.remove(); } renderMarkdown(fullText, aiMsg); };
    try {
      const response = await callProviderImage(provider, base64, keys[provider], model, onChunk);
      const chatHist = initialHistory(provider, response);
      if (state.enableVisualization && response.trim()) { try { await renderVisualization(response, wrapper, tabId); } catch (e) { console.error(e); } }
      state.runningJobs[tabId] = false; state.answerCache[tabId] = { rawResponse: response, chatHistory: chatHist, solutionHTML: wrapper.innerHTML };
      if (tabId === state.activeTabId) { state.rawResponse = response; state.chatHistory = [...chatHist]; state.isSolved = true; }
      finish();
    } catch (err) {
      state.runningJobs[tabId] = false; thinking?.remove(); wrapper.insertAdjacentHTML("beforeend", getErrorHtml(`Failed to analyze (${tabId})`, err.message || "Unknown error"));
      state.answerCache[tabId] = { rawResponse: "", chatHistory: [], solutionHTML: wrapper.innerHTML };
      if (tabId === state.activeTabId) { setSolutionState("error"); state.isSolved = false; el.errorActions.classList.remove("hidden"); scrollToBottom(); }
      finish();
    }
  });
  clearAttachment();
  if (isMobile()) document.getElementById("tabSolution")?.click();
}

export async function solveSelection(resetGlobalCache = false) {
  if (resetGlobalCache) { state.answerCache = {}; state.runningJobs = {}; state.jobNodes = {}; }
  const currentTabId = state.activeTabId; if (!currentTabId) return;
  const [provider, model] = currentTabId.split(":");
  if (!sel.active || sel.w < MIN_SEL || sel.h < MIN_SEL) return showToast("Draw a selection first.");
  const key = providerKeys()[provider];
  if (!key) { showToast(`⚙️ Add your ${providerNames[provider] || provider} API key in Settings first.`); openSettings(); return; }
  const base64 = cropSelectionToBase64(); if (!base64) return showToast("Could not capture the selection. Try again.");
  setSolutionState("loading"); disableOutputBtns(); state.isSolved = false; el.solutionContent.innerHTML = ""; el.errorActions.classList.add("hidden");
  el.loadingSubText.textContent = `${providerNames[provider] || provider} is analyzing your selection…`;
  if (isMobile() && window.showPanel) window.showPanel("solution");
  const wrapper = document.createElement("div"); wrapper.className = "job-wrapper"; state.jobNodes[currentTabId] = wrapper;
  let thinking = null; let response = "";
  try {
    state.runningJobs[currentTabId] = true; setSolutionState("content"); el.solutionContent.appendChild(wrapper); thinking = appendThinkingIndicator(wrapper);
    const aiMsg = document.createElement("div"); aiMsg.className = "chat-msg-ai"; wrapper.appendChild(aiMsg);
    let first = false; const onChunk = (fullText) => { if (!first) { first = true; thinking?.remove(); } renderMarkdown(fullText, aiMsg); };
    response = await callProviderImage(provider, base64, key, model, onChunk);
    state.chatHistory = initialHistory(provider, response);
    if (state.enableVisualization && response.trim()) { try { await renderVisualization(response, wrapper, currentTabId); } catch (e) { console.error(e); } }
    state.runningJobs[currentTabId] = false; thinking?.remove(); state.answerCache[currentTabId] = { rawResponse: response, chatHistory: [...state.chatHistory], solutionHTML: wrapper.innerHTML };
    state.rawResponse = response; state.isSolved = true; clearAttachment(); enableOutputBtns();
    setHint("Done! " + (isMobile() ? "Switch to Solution tab to see the answer." : "Drag a new selection or ask a follow-up question below."));
    if (isMobile()) document.getElementById("tabSolution")?.click();
  } catch (err) {
    state.runningJobs[currentTabId] = false; thinking?.remove(); wrapper.insertAdjacentHTML("beforeend", getErrorHtml("AI request failed", err.message || "Something went wrong."));
    state.answerCache[currentTabId] = { rawResponse: "", chatHistory: [], solutionHTML: wrapper.innerHTML };
    setSolutionState("error"); state.isSolved = false; el.errorActions.classList.remove("hidden"); scrollToBottom(); setHint("Something went wrong. Try again.");
  }
}

export async function sendMessage() {
  const currentTabId = state.activeTabId; if (!currentTabId) return;
  const [provider, model] = currentTabId.split(":"); const text = el.chatInput.value.trim(); const base64 = state.pendingAttachment;
  if (!text && !base64) return showToast("Type a question or select a region first.");
  const key = providerKeys()[provider];
  if (!key) { showToast(`⚙️ Add your ${providerNames[provider] || provider} API key in Settings first.`); openSettings(); return; }
  const isNew = !!base64 || state.chatHistory.length === 0; el.chatInput.value = ""; if (base64) clearSelection(); disableOutputBtns();
  let wrapper = isNew ? null : state.jobNodes[currentTabId];
  if (isNew) { state.chatHistory = []; state.rawResponse = ""; wrapper = document.createElement("div"); wrapper.className = "job-wrapper"; state.jobNodes[currentTabId] = wrapper; setSolutionState("content"); el.solutionContent.innerHTML = ""; el.solutionContent.appendChild(wrapper); el.errorActions.classList.add("hidden"); state.isSolved = false; }
  else if (!wrapper) { wrapper = document.createElement("div"); wrapper.className = "job-wrapper"; wrapper.innerHTML = el.solutionContent.innerHTML; state.jobNodes[currentTabId] = wrapper; }
  if (isMobile() && window.showPanel) window.showPanel("solution");
  let response = ""; let thinking = null;
  try {
    state.runningJobs[currentTabId] = true; if (!document.body.contains(wrapper)) { el.solutionContent.innerHTML = ""; el.solutionContent.appendChild(wrapper); } else if (!el.solutionContent.contains(wrapper) && currentTabId === state.activeTabId) el.solutionContent.appendChild(wrapper);
    appendUserMessage(text, wrapper, base64); thinking = appendThinkingIndicator(wrapper); const aiMsg = document.createElement("div"); aiMsg.className = "chat-msg-ai"; wrapper.appendChild(aiMsg);
    let first = false; const onChunk = (fullText) => { if (!first) { first = true; thinking?.remove(); } renderMarkdown(fullText, aiMsg); };
    if (provider === "gemini") {
      const parts = []; if (base64) parts.push({ inlineData: { mimeType: "image/jpeg", data: base64 } }); if (text) parts.push({ text }); state.chatHistory.push({ role: "user", parts }); response = await callGeminiChat(state.chatHistory, key, model, onChunk); state.chatHistory.push({ role: "model", parts: [{ text: response }] });
    } else if (provider === "groq" || provider === "mistral") {
      let content = text; if (base64) { content = []; if (text) content.push({ type: "text", text }); content.push({ type: "image_url", ...(provider === "groq" ? { image_url: { url: `data:image/png;base64,${base64}` } } : { image_url: `data:image/png;base64,${base64}` }) }); }
      state.chatHistory.push({ role: "user", content }); response = provider === "groq" ? await callGroqFollowUp(state.chatHistory, key, model, onChunk) : await callMistralFollowUp(state.chatHistory, key, model, onChunk); state.chatHistory.push({ role: "assistant", content: response });
    } else if (provider === "ollama") {
      const msg = { role: "user", content: text || "Please solve the question in this image." }; if (base64) msg.images = [base64]; state.chatHistory.push(msg); response = await callOllamaFollowUp(state.chatHistory, key, model, onChunk); state.chatHistory.push({ role: "assistant", content: response });
    } else if (provider === "openrouter") {
      let content = text || "Please solve the question in this image."; if (base64) { content = [{ type: "text", text: content }, { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }]; }
      state.chatHistory.push({ role: "user", content }); response = await callOpenRouterFollowUp(state.chatHistory, key, model, onChunk); state.chatHistory.push({ role: "assistant", content: response });
    }
    if (state.enableVisualization && response.trim()) { try { await renderVisualization(response, wrapper, currentTabId); } catch (e) { console.error(e); } }
    state.rawResponse = isNew ? response : state.rawResponse + "\n\n" + response; state.runningJobs[currentTabId] = false; state.isSolved = true;
    state.answerCache[currentTabId] = { rawResponse: state.rawResponse, chatHistory: [...state.chatHistory], solutionHTML: wrapper.innerHTML }; enableOutputBtns();
  } catch (err) {
    state.runningJobs[currentTabId] = false; wrapper.querySelectorAll(".chat-msg-thinking").forEach(n => n.remove()); wrapper.insertAdjacentHTML("beforeend", getErrorHtml("Request failed", err.message || "Something went wrong.")); if (currentTabId === state.activeTabId) scrollToBottom(); console.error(err);
  } finally { wrapper.querySelectorAll(".chat-msg-thinking").forEach(n => n.remove()); if (state.answerCache[currentTabId]) state.answerCache[currentTabId].solutionHTML = wrapper.innerHTML; enableOutputBtns(); }
}
