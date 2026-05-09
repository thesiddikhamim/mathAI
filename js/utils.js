import { el } from './dom.js';
import { state } from './state.js';

export function showToast(msg, ms = 2800) {
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

export async function copyText(text) {
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

export function scrollToBottom(force = true) {
  const parent = el.solutionContent.parentElement;
  if (!parent) return;

  if (!force && state.isUserScrolledUp) {
    // User is manually scrolling up, do not force scroll down
    return;
  }
  parent.scrollTop = parent.scrollHeight;
}

export function getErrorHtml(title, message) {
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

/**
 * Process an SSE or NDJSON stream response
 */
export async function processStream(response, onChunk, parser) {
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
