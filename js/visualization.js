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
4. NO CODE: Do NOT write any code. Focus on the visual strategy.`;

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

        const effectiveText = currentPlanText || aiText;

        if (state.visEngine === "tikz") {
          // --- TikZ / Kroki Logic ---
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
3. PROFESSIONAL STYLING:
   - Typography: Use $...$ for all mathematical text.
   - Colors: Use academic colors (black, blue!70!black, red!70!black).
4. RELIABILITY:
   - Semicolons: Every TikZ, PGFPlots command MUST end with a semicolon (;).
   - Driver Compatibility: NEVER use \`shader=interp\`. It is not supported.
   - No External Files: NEVER use \`gnuplot\`.`;

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
          
          let tikzCode = "";
          
          // First, try to extract from code blocks
          const tikzRegex = /```(?:latex|tikz|tex)?\s*\n?([\s\S]*?)```/i;
          const tikzMatch = tikzRegex.exec(visCodeText);
          
          if (tikzMatch && tikzMatch[1].trim().length > 0) {
            tikzCode = tikzMatch[1].trim();
          } else {
            // If no code blocks, try to find tikzpicture directly
            const beginIdx = visCodeText.indexOf("\\begin{tikzpicture}");
            const endIdx = visCodeText.lastIndexOf("\\end{tikzpicture}");
            
            if (beginIdx !== -1) {
              if (endIdx !== -1 && endIdx > beginIdx) {
                tikzCode = visCodeText.substring(beginIdx, endIdx + "\\end{tikzpicture}".length);
              } else {
                tikzCode = visCodeText.substring(beginIdx) + "\n\\end{tikzpicture}";
              }
            } else {
              // Last resort: remove backticks and use as-is
              tikzCode = visCodeText.replace(/```/g, "").trim();
            }
          }
          
          // Clean up common issues
          if (tikzCode.includes("\\begin{axis}") && !tikzCode.includes("\\end{axis}")) {
            tikzCode = tikzCode.replace("\\end{tikzpicture}", "\\end{axis}\n\\end{tikzpicture}");
          }
          
          // If tikzCode doesn't contain \begin{tikzpicture}, but contains \begin{axis}, wrap it
          if (!tikzCode.includes("\\begin{tikzpicture}") && tikzCode.includes("\\begin{axis}")) {
            tikzCode = "\\begin{tikzpicture}\n" + tikzCode + "\n\\end{tikzpicture}";
          }

          if (!tikzCode || (!tikzCode.includes("\\begin{tikzpicture}") && !tikzCode.includes("\\begin{axis}"))) {
            console.error("Failed to extract TikZ code from AI response:", visCodeText.substring(0, 500));
            throw new Error("The AI model failed to produce valid TikZ code. Please try regenerating.");
          }

          updateVisLoadingUI("Rendering TikZ/PGFPlots via Web API...");
          
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
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 45000);

          try {
            svgResp = await fetch("/api/kroki", {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: printCode,
              signal: controller.signal
            });
            if (!svgResp.ok) throw new Error(`Proxy returned status ${svgResp.status}`);
          } catch (err) {
            svgResp = await fetch("https://kroki.io/tikz/svg", {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: printCode,
              signal: controller.signal
            });
          } finally {
            clearTimeout(timeoutId);
          }

          if (!svgResp.ok) throw new Error("TikZ compilation error");
          const svgText = await svgResp.text();

          const visualDiv = document.createElement("div");
          visualDiv.style.cssText = "margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow-x: auto; width: 100%;";
          visualDiv.innerHTML = svgText;
          const svgEl = visualDiv.querySelector("svg");
          if(svgEl) {
             svgEl.style.maxWidth = "100%";
             svgEl.style.height = "auto";
             svgEl.style.display = "block";
             svgEl.style.margin = "0 auto";
          }
          visContainer.innerHTML = "";
          visContainer.appendChild(visualDiv);

        } else if (state.visEngine === "svg") {
          // --- Direct SVG / AI Generated Logic ---
          updateVisLoadingUI(`Generating SVG code via ${visModel}...`);

          const coderPrompt = `You are an expert SVG visualization coder for mathematical diagrams.
I am providing you with a ${currentPlanText ? 'DESIGN PLAN' : 'MATH SOLUTION'}. 
Your task is to implement this visualization directly as SVG code.

Source Material:
${effectiveText}

Rules for Professional Math Diagrams:
1. STRICT FORMATTING: ONLY output valid SVG code within a \`\`\`svg ... \`\`\` block. MUST start with <svg> and end with </svg>.
2. SVG STRUCTURE:
   - Set appropriate viewBox and dimensions (e.g., viewBox="0 0 800 600" width="800" height="600")
   - Use a clean white or transparent background
   - Include xmlns="http://www.w3.org/2000/svg" in the svg tag
3. MATHEMATICAL ELEMENTS:
   - Use <path> for curves and complex shapes
   - Use <line>, <circle>, <rect>, <polygon> for basic shapes
   - Use <text> for labels with mathematical notation (use Unicode math symbols or simple LaTeX-like text)
   - Add <marker> elements for arrows if needed
4. STYLING:
   - Colors: Use academic colors (black, blue!70!black, red!70!black).
   - Set appropriate stroke-width, fill, and opacity
   - Add clear labels and annotations
5. QUALITY:
   - Ensure all coordinates are precise
   - Make the diagram scalable and clean
   - Use consistent styling throughout
   - Add comments in SVG if helpful for understanding structure

Example structure:
\`\`\`svg
<svg viewBox="0 0 800 600" width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="800" height="600" fill="white"/>
  
  <!-- Grid or axes if needed -->
  <line x1="50" y1="300" x2="750" y2="300" stroke="black" stroke-width="2"/>
  
  <!-- Your visualization elements -->
  <circle cx="400" cy="300" r="50" fill="none" stroke="#4169E1" stroke-width="2"/>
  
  <!-- Labels -->
  <text x="400" y="280" text-anchor="middle" font-size="16">Label</text>
</svg>
\`\`\``;

          let svgCodeText = "";
          if (visProvider === "gemini") {
            svgCodeText = await callGeminiChat([{ role: "user", parts: [{ text: coderPrompt }] }], providerKey, visModel, noop);
          } else if (visProvider === "groq") {
            svgCodeText = await callGroqFollowUp([{ role: "user", content: coderPrompt }], providerKey, visModel, noop);
          } else if (visProvider === "mistral") {
            svgCodeText = await callMistralFollowUp([{ role: "user", content: coderPrompt }], providerKey, visModel, noop);
          } else if (visProvider === "ollama") {
            svgCodeText = await callOllamaFollowUp([{ role: "user", content: coderPrompt }], providerKey, visModel, noop);
          }

          let svgCode = "";
          const svgRegex = /```(?:svg|xml|html)?\s*\n?([\s\S]*?)```/i;
          const svgMatch = svgRegex.exec(svgCodeText);
          
          if (svgMatch && svgMatch[1].trim().length > 0) {
            svgCode = svgMatch[1].trim();
          } else {
            // Try to extract SVG directly
            const svgStartIdx = svgCodeText.indexOf("<svg");
            const svgEndIdx = svgCodeText.lastIndexOf("</svg>");
            
            if (svgStartIdx !== -1 && svgEndIdx !== -1 && svgEndIdx > svgStartIdx) {
              svgCode = svgCodeText.substring(svgStartIdx, svgEndIdx + "</svg>".length);
            } else {
              // Last resort: remove backticks
              svgCode = svgCodeText.replace(/```/g, "").trim();
            }
          }

          if (!svgCode || !svgCode.includes("<svg")) {
            console.error("Failed to extract SVG code from AI response:", svgCodeText.substring(0, 500));
            throw new Error("The AI model failed to produce valid SVG code. Please try regenerating.");
          }

          updateVisLoadingUI("Rendering SVG...");

          const visualDiv = document.createElement("div");
          visualDiv.style.cssText = "margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow-x: auto; width: 100%;";
          visualDiv.innerHTML = svgCode;
          const svgEl = visualDiv.querySelector("svg");
          if(svgEl) {
             svgEl.style.maxWidth = "100%";
             svgEl.style.height = "auto";
             svgEl.style.display = "block";
             svgEl.style.margin = "0 auto";
          }
          visContainer.innerHTML = "";
          visContainer.appendChild(visualDiv);

        } else {
          // --- Matplotlib / Pyodide Logic ---
          updateVisLoadingUI(`Writing Matplotlib Python code via ${visModel}...`);

          const coderPrompt = `You are an expert Python Matplotlib mathematical visualization coder.
I am providing you with a ${currentPlanText ? 'DESIGN PLAN' : 'MATH SOLUTION'}. 
Your task is to implement this visualization exactly using Matplotlib and Numpy.

Source Material:
${effectiveText}

Rules for Professional Math Diagrams:
1. STRICT FORMATTING: ONLY output valid Python code within a \`\`\`python ... \`\`\` block.
2. CANVAS SETUP: 
   - MUST save the final figure to 'output.png' using \`plt.savefig('output.png', dpi=150, bbox_inches='tight')\`.
   - Use a clean white background.
3. SHAPES & GEOMETRY:
   - Use \`matplotlib.patches\` (Circle, Rectangle, Polygon, Arc) for 2D geometric diagrams.
   - For 3D visualizations, use \`from mpl_toolkits.mplot3d import Axes3D\` and \`ax = fig.add_subplot(111, projection='3d')\`.
   - Example: \`rect = patches.Rectangle((x,y), width, height)\`, then \`ax.add_patch(rect)\`.
   - Use \`plt.plot()\` for lines and functions.
4. TYPOGRAPHY:
   - Use LaTeX for all labels and text, e.g., \`plt.title(r'$\\int f(x) dx$')\`.
   - Ensure labels don't overlap. Use arrows or offsets if needed.
5. NO GUI: Do NOT use \`plt.show()\`. Use \`plt.savefig('output.png')\`.`;

          let pyCodeText = "";
          if (visProvider === "gemini") {
            pyCodeText = await callGeminiChat([{ role: "user", parts: [{ text: coderPrompt }] }], providerKey, visModel, noop);
          } else if (visProvider === "groq") {
            pyCodeText = await callGroqFollowUp([{ role: "user", content: coderPrompt }], providerKey, visModel, noop);
          } else if (visProvider === "mistral") {
            pyCodeText = await callMistralFollowUp([{ role: "user", content: coderPrompt }], providerKey, visModel, noop);
          } else if (visProvider === "ollama") {
            pyCodeText = await callOllamaFollowUp([{ role: "user", content: coderPrompt }], providerKey, visModel, noop);
          }

          let pythonCode = "";
          const pyRegex = /```(?:python|py)?\s*\n?([\s\S]*?)```/i;
          const pyMatch = pyRegex.exec(pyCodeText);
          pythonCode = pyMatch ? pyMatch[1].trim() : pyCodeText.replace(/```/g, "").trim();

          if (!pythonCode || (!pythonCode.includes("plt") && !pythonCode.includes("matplotlib"))) {
            console.error("Failed to extract Python code from AI response:", pyCodeText.substring(0, 500));
            throw new Error("The AI model failed to produce valid Matplotlib code. Please try regenerating.");
          }

          updateVisLoadingUI("Rendering diagram locally via Python (WebAssembly)...");
          const imgData = await runPythonInWorker(pythonCode);
          
          const blob = new Blob([imgData], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          
          const visualDiv = document.createElement("div");
          visualDiv.style.cssText = "margin-top: 1.5rem; text-align: center;";
          visualDiv.innerHTML = `<img src="${url}" style="max-width: 100%; height: auto; border-radius: var(--radius-md); box-shadow: var(--shadow-sm);" />`;
          
          visContainer.innerHTML = "";
          visContainer.appendChild(visualDiv);
        }

        // Add Regenerate button
        const regenWrapper = document.createElement("div");
        regenWrapper.style.cssText = "margin-top: 12px; text-align: center;";
        const regenBtn = document.createElement("button");
        regenBtn.className = "btn btn-outline btn-sm";
        regenBtn.innerHTML = `<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg> Regenerate Image`;
        regenBtn.addEventListener("click", () => startVisualization());
        regenWrapper.appendChild(regenBtn);
        visContainer.appendChild(regenWrapper);

        scrollToBottom(true);
        updateCache();

    } catch (err) {
      console.error("Visualization error:", err);
      visContainer.innerHTML = `<div style="margin-top: 1.5rem; padding: 0.85rem; border: 1px solid var(--danger); border-radius: var(--radius-md); color: var(--danger); font-size: 13px; background: rgba(239, 68, 68, 0.05); text-align: center;"><div style="font-weight: 500; margin-bottom: 6px;">Visualization generation failed.</div><div style="opacity: 0.8; font-size: 11.5px; margin-bottom: 12px; word-break: break-all;">${(err.message || "Unknown error").replace(/</g, "&lt;")}</div><button class="btn btn-outline btn-sm" style="border-color: var(--danger); color: var(--danger); font-size: 12px; padding: 6px 12px; border-radius: var(--radius-md);">Try Again</button></div>`;
      visContainer.querySelector('button').addEventListener('click', () => startVisualization());
      scrollToBottom(true);
      updateCache();
    }
  };

  if (state.visMode === "ask") {
    visContainer.innerHTML = `<div style="margin-top: 1.5rem; text-align: center;"><button class="btn btn-outline" style="padding: 10px 16px; border-radius: var(--radius-md); font-weight: 500;"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> Generate Visualization</button></div>`;
    visContainer.querySelector('button').addEventListener('click', () => startVisualization());
    scrollToBottom(true);
    updateCache();
  } else {
    startVisualization();
  }
}
