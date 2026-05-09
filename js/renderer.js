import { RENDER_THROTTLE_MS } from './config.js';
import { el } from './dom.js';
import { state } from './state.js';
import { setSolutionState } from './ui-manager.js';
import { scrollToBottom } from './utils.js';

const renderQueueMap = new WeakMap();

export function renderMarkdown(raw, container) {
  let rState = renderQueueMap.get(container);
  if (!rState) {
    rState = { pendingRaw: null, isRendering: false, lastRenderTime: 0, timerId: null };
    renderQueueMap.set(container, rState);
  }

  rState.pendingRaw = raw;

  const executeRender = () => {
    if (rState.pendingRaw === null) return;
    
    rState.isRendering = true;
    const textToRender = rState.pendingRaw;
    rState.pendingRaw = null;

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

    rState.lastRenderTime = Date.now();
    rState.isRendering = false;

    if (container === el.solutionContent || el.solutionContent.contains(container)) {
      scrollToBottom(false);
    }

    if (rState.pendingRaw !== null) {
      rState.timerId = setTimeout(() => {
        requestAnimationFrame(executeRender);
      }, RENDER_THROTTLE_MS);
    }
  };

  if (rState.isRendering) return;

  const now = Date.now();
  const timeSinceLast = now - rState.lastRenderTime;

  if (timeSinceLast >= RENDER_THROTTLE_MS) {
    if (rState.timerId) {
      clearTimeout(rState.timerId);
      rState.timerId = null;
    }
    requestAnimationFrame(executeRender);
  } else {
    if (!rState.timerId) {
      rState.timerId = setTimeout(() => {
        rState.timerId = null;
        requestAnimationFrame(executeRender);
      }, RENDER_THROTTLE_MS - timeSinceLast);
    }
  }
}

export function renderSolution(raw) {
  setSolutionState("content");
  el.solutionContent.innerHTML = "";

  const aiMsg = document.createElement("div");
  aiMsg.className = "chat-msg-ai";
  el.solutionContent.appendChild(aiMsg);
  renderMarkdown(raw, aiMsg);

  el.solutionContent.parentElement.scrollTop = 0;
}

export function appendUserMessage(text, container = el.solutionContent) {
  const userMsg = document.createElement("div");
  userMsg.className = "chat-msg-user";
  userMsg.textContent = text;
  container.appendChild(userMsg);
  if (container === el.solutionContent || el.solutionContent.contains(container)) {
    scrollToBottom();
  }
}

export function appendAIMessage(raw) {
  const aiMsg = document.createElement("div");
  aiMsg.className = "chat-msg-ai";
  el.solutionContent.appendChild(aiMsg);
  renderMarkdown(raw, aiMsg);
}

export function appendThinkingIndicator(container = el.solutionContent) {
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
