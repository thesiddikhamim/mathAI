import { state, sel } from './state.js';
import { el } from './dom.js';
import { MIN_SEL } from './config.js';
import { showToast, getErrorHtml, scrollToBottom } from './utils.js';
import { setSolutionState, enableOutputBtns, disableOutputBtns, isMobile, setHint } from './ui-manager.js';
import { cropSelectionToBase64, clearSelection, clearAttachment } from './selection.js';
import { appendThinkingIndicator, renderMarkdown, appendUserMessage } from './renderer.js';
import { callGeminiChat, callGroqChat, callMistralChat, callOllamaChat, callGroqFollowUp, callMistralFollowUp, callOllamaFollowUp } from './ai-service.js';
import { renderVisualization } from './visualization.js';
import { openSettings } from './settings.js';

export async function solveAllSelection() {
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

  clearAttachment();

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
export async function solveSelection(resetGlobalCache = false) {
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

    clearAttachment();
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

/**
 * Unified chat send — handles text-only, image-only (active selection), or both.
 * An active selection starts a fresh question (image + optional text); a text-only
 * message continues the current conversation (or starts a new text-only one).
 * Always targets the active model tab.
 */
export async function sendMessage() {
  const currentTabId = state.activeTabId;
  if (!currentTabId) return;
  const [currentProvider, currentModel] = currentTabId.split(":");

  const text = el.chatInput.value.trim();
  const base64 = state.pendingAttachment;

  if (!text && !base64) {
    showToast("Type a question or select a region first.");
    return;
  }

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
    showToast(`⚙️ Add your ${names[currentProvider]} API key in Settings first.`);
    openSettings();
    return;
  }

  // An attached image (or an empty thread) means a brand-new question.
  const isNew = !!base64 || state.chatHistory.length === 0;

  el.chatInput.value = "";
  if (base64) clearSelection();
  disableOutputBtns();

  let wrapper;
  if (isNew) {
    state.chatHistory = [];
    state.rawResponse = "";
    wrapper = document.createElement("div");
    wrapper.className = "job-wrapper";
    state.jobNodes[currentTabId] = wrapper;
    setSolutionState("content");
    el.solutionContent.innerHTML = "";
    el.solutionContent.appendChild(wrapper);
    el.errorActions.classList.add("hidden");
    state.isSolved = false;
  } else {
    wrapper = state.jobNodes[currentTabId];
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "job-wrapper";
      wrapper.innerHTML = el.solutionContent.innerHTML;
      state.jobNodes[currentTabId] = wrapper;
    }
  }

  if (isMobile() && window.showPanel) {
    window.showPanel("solution");
  }

  let response = "";
  let thinkingIndicator = null;

  try {
    state.runningJobs[currentTabId] = true;

    if (!document.body.contains(wrapper)) {
      el.solutionContent.innerHTML = "";
      el.solutionContent.appendChild(wrapper);
    } else if (
      !el.solutionContent.contains(wrapper) &&
      currentTabId === state.activeTabId
    ) {
      el.solutionContent.appendChild(wrapper);
    }

    appendUserMessage(text, wrapper, base64);

    thinkingIndicator = appendThinkingIndicator(wrapper);

    const aiMsg = document.createElement("div");
    aiMsg.className = "chat-msg-ai";
    wrapper.appendChild(aiMsg);

    let firstChunkReceived = false;
    const onChunk = (fullText, chunkText) => {
      if (!firstChunkReceived) {
        firstChunkReceived = true;
        if (thinkingIndicator && thinkingIndicator.parentNode)
          thinkingIndicator.remove();
      }
      renderMarkdown(fullText, aiMsg);
    };

    if (currentProvider === "gemini") {
      const parts = [];
      if (base64)
        parts.push({ inlineData: { mimeType: "image/jpeg", data: base64 } });
      if (text) parts.push({ text });
      state.chatHistory.push({ role: "user", parts });
      response = await callGeminiChat(
        state.chatHistory,
        providerKey,
        currentModel,
        onChunk,
      );
      state.chatHistory.push({ role: "model", parts: [{ text: response }] });
    } else if (currentProvider === "groq") {
      let content = text;
      if (base64) {
        content = [];
        if (text) content.push({ type: "text", text });
        content.push({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64}` },
        });
      }
      state.chatHistory.push({ role: "user", content });
      response = await callGroqFollowUp(
        state.chatHistory,
        providerKey,
        currentModel,
        onChunk,
      );
      state.chatHistory.push({ role: "assistant", content: response });
    } else if (currentProvider === "mistral") {
      let content = text;
      if (base64) {
        content = [];
        if (text) content.push({ type: "text", text });
        content.push({
          type: "image_url",
          image_url: `data:image/png;base64,${base64}`,
        });
      }
      state.chatHistory.push({ role: "user", content });
      response = await callMistralFollowUp(
        state.chatHistory,
        providerKey,
        currentModel,
        onChunk,
      );
      state.chatHistory.push({ role: "assistant", content: response });
    } else if (currentProvider === "ollama") {
      const msg = {
        role: "user",
        content: text || "Please solve the question in this image.",
      };
      if (base64) msg.images = [base64];
      state.chatHistory.push(msg);
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

    state.rawResponse = isNew ? response : state.rawResponse + "\n\n" + response;
    state.runningJobs[currentTabId] = false;
    state.isSolved = true;

    state.answerCache[currentTabId] = {
      rawResponse: state.rawResponse,
      chatHistory: [...state.chatHistory],
      solutionHTML: wrapper.innerHTML,
    };

    enableOutputBtns();
  } catch (err) {
    state.runningJobs[currentTabId] = false;
    wrapper.querySelectorAll(".chat-msg-thinking").forEach((node) => node.remove());
    wrapper.insertAdjacentHTML(
      "beforeend",
      getErrorHtml(
        "Request failed",
        err.message || "Something went wrong.",
      ),
    );
    if (currentTabId === state.activeTabId) {
      scrollToBottom();
    }
    console.error(err);
  } finally {
    wrapper.querySelectorAll(".chat-msg-thinking").forEach((node) => node.remove());
    if (state.answerCache[currentTabId]) {
      state.answerCache[currentTabId].solutionHTML = wrapper.innerHTML;
    }
    enableOutputBtns();
  }
}
