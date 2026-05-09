import { state } from './state.js';
import { el } from './dom.js';
import { scrollToBottom } from './utils.js';
import { callGeminiChat, callGroqFollowUp, callMistralFollowUp, callOllamaFollowUp } from './ai-service.js';

let pyodideWorker = null;

export function getPyodideWorker() {
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

export function runPythonInWorker(code) {
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

export async function renderVisualization(aiText, wrapper, tabId) {
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

  const [planProvider, planModel] = state.visPlannerModelConfig.split(":");
  const plannerKey = {
    gemini: state.apiKey,
    groq: state.groqApiKey,
    mistral: state.mistralApiKey,
    ollama: state.ollamaApiKey,
  }[planProvider];

  if (!providerKey || (state.enableVisPlanner && !plannerKey)) {
    console.warn("Skipping visualization: Missing API key.");
    return;
  }

  const visContainer = document.createElement("div");
  visContainer.className = "vis-container";
  wrapper.appendChild(visContainer);

  const updateCache = () => {
    if (tabId && state.answerCache[tabId]) {
      state.answerCache[tabId].solutionHTML = wrapper.innerHTML;
    }
  };

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
    updateCache();
  };

  let currentPlanText = null;

  const startVisualization = async () => {
    try {
      const noop = () => {};

      if (state.enableVisPlanner && !currentPlanText) {
        const plannerPrompt = `You are an expert mathematical visualization designer. I am providing you with a step-by-step solution to a math problem.
Your task is to summarize the key points of the solution and design a detailed plan for a visualization.

Context:
${aiText}

Rules for the Plan:
1. DESIGN ONLY: Describe exactly what to visualize (e.g., "A 3D surface plot of the function...", "A geometric diagram showing the tangent line...", "A coordinate graph with an area shaded...").
2. TYPE SELECTION: Explicitly state the visualization type (2D Graph, 3D Surface, Geometry Diagram, or Flowchart).
3. PLACEMENT: Describe where labels, points, and annotations should go for maximum clarity.
4. NO CODE: Do NOT write any TikZ or PGFPlots code. Focus on the visual strategy.`;

        updateVisLoadingUI(`Designing visualization plan via ${planModel}...`);
        
        let planResp = "";
        if (planProvider === "gemini") {
          planResp = await callGeminiChat([{ role: "user", parts: [{ text: plannerPrompt }] }], plannerKey, planModel, noop);
        } else if (planProvider === "groq") {
          planResp = await callGroqFollowUp([{ role: "user", content: plannerPrompt }], plannerKey, planModel, noop);
        } else if (planProvider === "mistral") {
          planResp = await callMistralFollowUp([{ role: "user", content: plannerPrompt }], plannerKey, planModel, noop);
        } else if (planProvider === "ollama") {
          planResp = await callOllamaFollowUp([{ role: "user", content: plannerPrompt }], plannerKey, planModel, noop);
        }
        
          if (planResp && planResp.trim().length > 0) {
            currentPlanText = planResp;
          }
        }

        // Use the plan if one exists, otherwise fall back to raw solution
        const effectiveText = currentPlanText || aiText;

        // Generate TikZ from the plan (or raw content)
        updateVisLoadingUI(`Writing TikZ/PGFPlots code via ${visModel}...`);

        const coderPrompt = `You are an expert LaTeX TikZ and PGFPlots visualization coder.
I am providing you with a ${currentPlanText ? 'DESIGN PLAN' : 'MATH SOLUTION'}. 
Your task is to implement this visualization exactly using TikZ and PGFPlots.

Source Material:
${effectiveText}

Rules for University-Level Textbook Aesthetics:
1. STRICT FORMATTING: ONLY output valid TikZ, PGFPlots code within a \`\`\`latex ... \`\`\` block. MUST start with \\begin{tikzpicture} and end with \\end{tikzpicture}.
2. TOOL SELECTION:
   - Use PGFPlots (\`\\begin{axis}...\`) for any function plots, 3D surfaces, data visualization, or coordinate-based graphs.
   - Use TikZ commands (\`\\draw\`, \`\\node\`, etc.) for geometric diagrams (circles, triangles), flowcharts, and custom annotations.
   - COMBINING THEM: For annotated graphs, draw TikZ elements INSIDE the \`axis\` environment. Use axis coordinates (e.g., \`(axis cs:2,4)\`) to ensure callouts and arrows stay perfectly aligned with the plot data.
   - COLLISION AVOIDANCE: Ensure labels NEVER overlap with lines, points, or axes. Use positioning anchors (e.g., \`above\`, \`below left\`, \`pos=0.5\`) and small offsets (e.g., \`xshift=2pt\`) to keep text clear.
3. PROFESSIONAL STYLING:
   - Typography: Use $...$ for all mathematical text.
   - Colors: Use academic colors (black, blue!70!black, red!70!black).
   - Line Weights: Use \`thick\` for main curves/shapes and \`thin\` for grids/axes.
4. RELIABILITY:
   - Semicolons: Every TikZ, PGFPlots command MUST end with a semicolon (;).
   - Domains: Ensure PGFPlots domains don't cause math errors (e.g., negative values in sqrt).
   - Driver Compatibility: NEVER use \`shader=interp\`. It is not supported by our SVG renderer. Use \`shader=flat\`, \`shader=faceted\`, or standard coloring instead.
   - No External Files: NEVER use \`gnuplot\` or any contouring/plotting features that require external files (e.g., \`contour gnuplot\`). These are not supported by the renderer. Use native PGFPlots surfaces or TikZ paths instead.
   - Math in Options: NEVER place raw math expressions (like \`$x_2$\`) directly inside \`[...]\` options. Use proper keys like \`node contents={...}\`, \`label={...}\`, or \`pin={...}\`. Always wrap labels containing math or complex characters in curly braces \`{...}\` (e.g., \`label={[$x_2$]}\`).
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
      
      if (beginIdx !== -1) {
          if (endIdx !== -1 && endIdx > beginIdx) {
              tikzCode = visCodeText.substring(beginIdx, endIdx + "\\end{tikzpicture}".length);
          } else {
              // Auto-close if missing end
              tikzCode = visCodeText.substring(beginIdx) + "\n\\end{tikzpicture}";
          }
      } else {
          const tikzRegex = /\`\`\`(?:latex|tikz)?\n([\s\S]*?)\`\`\`/;
          const tikzMatch = tikzRegex.exec(visCodeText);
          if (tikzMatch && tikzMatch[1].trim().length > 0) {
            tikzCode = tikzMatch[1].trim();
        } else {
          tikzCode = visCodeText.replace(/\`\`\`/g, "").trim(); 
        }
    }

    // Secondary safety: auto-close unclosed axis environment
    if (tikzCode.includes("\\begin{axis}") && !tikzCode.includes("\\end{axis}")) {
        tikzCode = tikzCode.replace("\\end{tikzpicture}", "\\end{axis}\n\\end{tikzpicture}");
    }

    if (!tikzCode || !tikzCode.includes("\\begin{tikzpicture}")) {
       throw new Error("The AI model failed to produce valid TikZ code. Please try again.");
    }

    updateVisLoadingUI("Rendering TikZ/PGFPlots via Web API...");
    
    // Robustly strip common LaTeX wrappers if the AI included them
    let safeTikz = tikzCode
      .replace(/\\documentclass\[.*?\]\{.*?\}/g, '')
      .replace(/\\documentclass\{.*?\}/g, '')
      .replace(/\\usepackage\[.*?\]\{.*?\}/g, '')
      .replace(/\\usepackage\{.*?\}/g, '')
      .replace(/\\begin\{document\}/g, '')
      .replace(/\\end\{document\}/g, '')
      .replace(/\\pgfplotsset\{compat=.*?\}/g, '')
      .trim();

    const printCode = `\\documentclass[tikz,border=2pt]{standalone}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{xcolor}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usetikzlibrary{calc,angles,quotes,intersections,positioning,arrows.meta,decorations.markings,backgrounds,matrix}
\\begin{document}
${safeTikz}
\\end{document}`;

    let svgResp;
    let usedProxy = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

    try {
      console.log("Attempting to render TikZ via local proxy...");
      svgResp = await fetch("/api/kroki", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: printCode,
        signal: controller.signal
      });
      
      if (!svgResp.ok) {
        console.warn(`Proxy returned status ${svgResp.status}. Falling back to direct call.`);
        throw new Error(`Proxy status ${svgResp.status}`);
      }
    } catch (err) {
      usedProxy = false;
      const isTimeout = err.name === 'AbortError';
      console.warn(isTimeout ? "Proxy request timed out." : "Local proxy failed or unavailable.", err);
      
      try {
        const directController = new AbortController();
        const directTimeoutId = setTimeout(() => directController.abort(), 45000);
        
        svgResp = await fetch("https://kroki.io/tikz/svg", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: printCode,
          signal: directController.signal
        });
        clearTimeout(directTimeoutId);
      } catch (directErr) {
        console.error("Direct call to kroki.io also failed:", directErr);
        const msg = directErr.name === 'AbortError' ? "Request timed out (Kroki might be slow or code is too complex)." : directErr.message || "Network error";
        throw new Error(`Rendering failed: ${msg}. Check your connection or try again.`);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!svgResp.ok) {
      const errText = await svgResp.text().catch(() => "Could not read error body");
      console.error("Kroki Error Response:", errText);
      const cleanErr = errText.split("\n").slice(0, 5).join(" ").replace(/</g, "&lt;");
      throw new Error(`TikZ compilation error (${usedProxy ? "proxy" : "direct"}): ` + cleanErr);
    }
    
    const svgText = await svgResp.text();

    const visualDiv = document.createElement("div");
    visualDiv.style.cssText = "margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow-x: auto; background: transparent; width: 100%;";
    
    visualDiv.innerHTML = svgText;
    
    // adjust SVG max size so it doesn't break chat layout
    const svgEl = visualDiv.querySelector("svg");
    if(svgEl) {
       svgEl.style.maxWidth = "100%";
       svgEl.style.height = "auto";
       svgEl.style.display = "block";
       svgEl.style.margin = "0 auto";
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
    updateCache();

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
      updateCache();
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
    updateCache();
  } else {
    // visMode auto
    startVisualization();
  }
}
