import { state } from './state.js';
import { el } from './dom.js';
import { scrollToBottom } from './utils.js';
import { callGeminiChat, callGroqFollowUp, callMistralFollowUp, callOllamaFollowUp } from './ai-service.js';

let pyodideWorker = null;

// Token a coder model returns when a problem has nothing worth drawing.
const NO_VIS_TOKEN = "NO_VISUALIZATION";

// Deterministic, publication-quality Matplotlib style. Prepended to every
// generated Python snippet so figures look like a textbook regardless of what
// the model writes. The model is told NOT to override this.
const MPL_STYLE_PREAMBLE = `# === MathAI professional figure style (auto-injected) ===
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
try:
    plt.rcParams.update({
        'figure.figsize': (8, 5.2),
        'figure.dpi': 120,
        'savefig.dpi': 200,
        'savefig.bbox': 'tight',
        'savefig.pad_inches': 0.25,
        'figure.facecolor': 'white',
        'axes.facecolor': 'white',
        'savefig.facecolor': 'white',
        'font.family': 'serif',
        'font.serif': ['DejaVu Serif'],
        'font.size': 13,
        'mathtext.fontset': 'cm',
        'axes.titlesize': 15,
        'axes.titleweight': 'bold',
        'axes.titlepad': 12,
        'axes.labelsize': 13,
        'axes.labelpad': 6,
        'axes.linewidth': 1.1,
        'axes.edgecolor': '#2b2b2b',
        'axes.grid': True,
        'axes.axisbelow': True,
        'grid.color': '#9aa0aa',
        'grid.linewidth': 0.6,
        'grid.alpha': 0.35,
        'grid.linestyle': '--',
        'xtick.direction': 'in',
        'ytick.direction': 'in',
        'xtick.labelsize': 11,
        'ytick.labelsize': 11,
        'xtick.major.size': 5,
        'ytick.major.size': 5,
        'legend.frameon': True,
        'legend.framealpha': 0.92,
        'legend.edgecolor': '#cccccc',
        'legend.fancybox': False,
        'legend.fontsize': 11,
        'lines.linewidth': 2.0,
        'lines.markersize': 6,
        'axes.prop_cycle': plt.cycler(color=['#1f4e8c', '#c0392b', '#1e8449', '#b8860b', '#6c3483', '#0e7c86']),
    })
except Exception:
    pass
# === end style ===
`;

// Professional defaults applied to every PGFPlots axis. Appended styles, so any
// option the model sets on a specific axis still wins.
const PGFPLOTS_STYLE = `\\pgfplotsset{
  every axis/.append style={
    axis line style={black!55},
    tick style={black!55},
    tick label style={font=\\footnotesize},
    label style={font=\\small},
    title style={font=\\bfseries},
    legend style={draw=black!30, fill=white, font=\\footnotesize, rounded corners=1.5pt},
    grid=both,
    grid style={black!12, line width=0.3pt},
    major grid style={black!22, line width=0.4pt},
  },
}`;

// Returns true if the model declined to draw anything for this problem.
function isNoVisualization(text) {
  if (!text) return true;
  const stripped = text.replace(/[`*_#>\s]/g, "").toUpperCase();
  return stripped.includes(NO_VIS_TOKEN) && stripped.length < NO_VIS_TOKEN.length + 24;
}

// Wraps rendered output (img or svg node) in a framed, captioned figure so it
// reads like a textbook plate.
function buildFigure(innerNode, engineLabel) {
  const fig = document.createElement("figure");
  fig.className = "vis-figure";

  const frame = document.createElement("div");
  frame.className = "vis-figure-frame";
  frame.appendChild(innerNode);
  fig.appendChild(frame);

  const cap = document.createElement("figcaption");
  cap.className = "vis-figure-caption";
  cap.innerHTML = `<span class="vis-figure-tag">Figure</span> Generated visualization${engineLabel ? ` · ${engineLabel}` : ""}`;
  fig.appendChild(cap);

  return fig;
}

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

  const renderNoVis = () => {
    visContainer.innerHTML = `
      <div class="vis-none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"></path><circle cx="12" cy="12" r="9"></circle></svg>
        <span>No diagram is needed for this solution.</span>
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
        const plannerPrompt = `You are an art director for a mathematics textbook. Given the worked solution below, design the single most illuminating figure for it.

Solution:
${aiText}

Produce a concise visual brief (no code) covering:
1. NECESSITY: Decide whether a figure genuinely helps. If the problem is purely arithmetic, algebraic manipulation, or definitional with nothing geometric or graphical to show, reply with exactly "${NO_VIS_TOKEN}" and nothing else.
2. DIMENSIONALITY: State 2D or 3D, and justify in a few words. Use 3D ONLY when the mathematics is inherently three-dimensional (surface z=f(x,y), solid of revolution, space curve, plane/vectors in R³). Otherwise use 2D.
3. TYPE: e.g. function graph, shaded region/area, geometric diagram, triangle/circle construction, vector diagram, number line, bar/pie/data chart, 3D surface, parametric curve.
4. EXACT CONTENT: the precise functions, points, intervals, angles, and values to draw (use the real numbers from the solution), and which key features to mark (intercepts, extrema, intersections, asymptotes, tangent point, shaded area, labelled angles/sides).
5. ANNOTATIONS: where titles, axis labels (with units), point labels, and the legend should go for maximum clarity without overlap.
Keep it under ~150 words. Describe the visual strategy only — do NOT write code.`;

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
            if (isNoVisualization(planResp)) {
              renderNoVis();
              return;
            }
            currentPlanText = planResp;
          }
        }

        const effectiveText = currentPlanText || aiText;

        if (state.visEngine === "tikz") {
          // --- TikZ / Kroki Logic ---
          updateVisLoadingUI(`Writing TikZ/PGFPlots code via ${visModel}...`);

          const coderPrompt = `You are a master of LaTeX TikZ and PGFPlots who produces clean, textbook-quality mathematical figures. I am providing you with a ${currentPlanText ? 'DESIGN PLAN' : 'MATH SOLUTION'}. Implement ONE precise, accurate figure.

Source Material:
${effectiveText}

OUTPUT FORMAT (strict):
- Reply with ONE \`\`\`latex ... \`\`\` block and nothing else — no prose. It MUST start with \\begin{tikzpicture} and end with \\end{tikzpicture}.
- If there is genuinely nothing geometric or graphical worth drawing (pure arithmetic/algebra/definition), reply with exactly: ${NO_VIS_TOKEN}

DIMENSIONALITY — choose deliberately:
- 2D (default): function graphs, shaded regions/areas, geometry (triangles, circles), vectors in the plane, number lines, data charts.
- 3D ONLY when inherently three-dimensional (surface z=f(x,y), solid of revolution, space curve, plane/vectors in R³): use a PGFPlots \`axis\` with \`view={...}\`, \`\\addplot3[surf]\`, a \`colormap\`, and label x, y, z.

TOOL SELECTION:
- PGFPlots (\\begin{axis}...\\end{axis}) for any function plot, data chart, or coordinate graph. Set \`xlabel\`, \`ylabel\`, a short \`title\`, and \`samples=100\` (or more) for smooth curves.
- TikZ primitives (\\draw, \\node, \\fill, \\filldraw) for geometric constructions, with the \`angles\`/\`quotes\` libraries for marked angles and \`\\node\` labels for points.

ACCURACY:
- Plot the ACTUAL functions, points, intervals, and values from the source. Mark and label key features: intercepts, extrema, intersections, tangent points, the shaded region, angle measures, side lengths.

PROFESSIONAL STYLING (clean academic defaults are pre-applied to every axis — do not fight them):
- Use $...$ for ALL mathematical text and labels.
- Colours: a small, purposeful palette — e.g. blue!65!black, red!70!black, green!55!black; shade regions with low opacity (fill opacity=0.2).
- Keep line widths ~1pt; place labels so they never overlap the curve.

RELIABILITY:
- Every TikZ/PGFPlots statement MUST end with a semicolon (;).
- Do NOT include \\documentclass, \\usepackage, or \\begin{document} — only the tikzpicture.
- NEVER use \`shader=interp\`, external \`gnuplot\`, or PNG/file inputs.`;

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
          
          if (isNoVisualization(visCodeText)) {
            renderNoVis();
            return;
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

          const printCode = `\\documentclass[tikz,border=6pt]{standalone}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{xcolor}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usepgfplotslibrary{fillbetween,colormaps}
\\usetikzlibrary{calc,angles,quotes,intersections,positioning,arrows.meta,decorations.markings,backgrounds,matrix,patterns}
${PGFPLOTS_STYLE}
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

          const holder = document.createElement("div");
          holder.innerHTML = svgText;
          const svgEl = holder.querySelector("svg");
          if (svgEl) {
            svgEl.style.maxWidth = "100%";
            svgEl.style.height = "auto";
            svgEl.style.display = "block";
            svgEl.style.margin = "0 auto";
          }
          visContainer.innerHTML = "";
          visContainer.appendChild(buildFigure(svgEl || holder, "TikZ / PGFPlots"));

        } else if (state.visEngine === "svg") {
          // --- Direct SVG / AI Generated Logic ---
          updateVisLoadingUI(`Generating SVG code via ${visModel}...`);

          const coderPrompt = `You are an expert at hand-crafting clean, textbook-quality mathematical diagrams as raw SVG. I am providing you with a ${currentPlanText ? 'DESIGN PLAN' : 'MATH SOLUTION'}. Produce ONE precise figure.

Source Material:
${effectiveText}

OUTPUT FORMAT (strict):
- Reply with ONE \`\`\`svg ... \`\`\` block and nothing else. It MUST start with <svg ...> and end with </svg>, include xmlns="http://www.w3.org/2000/svg", and a viewBox (e.g. viewBox="0 0 760 520").
- If there is genuinely nothing geometric or graphical worth drawing, reply with exactly: ${NO_VIS_TOKEN}

SCOPE: SVG is best for 2D — function graphs, geometry, vectors, number lines, shaded regions, simple data charts. For an inherently 3D idea, draw a clear 2D projection (e.g. an oblique/axonometric sketch with x, y, z axes).

ACCURACY & LAYOUT:
- Establish a coordinate frame: draw x and y axes with arrowheads (define a <marker>), light gridlines, tick marks, and numeric tick labels. Map the problem's math coordinates to SVG pixels consistently.
- Draw the ACTUAL curves/shapes/points from the source. Approximate smooth curves with a <path> using enough points or cubic Béziers. Mark key features (intercepts, extrema, intersections, tangent point) with small dots and labels; shade regions with fill-opacity ~0.18.

PROFESSIONAL STYLE:
- White background <rect>. Axes in #2b2b2b (~1.5px); gridlines #d0d5dd (~1px). A restrained palette: curves in #1f4e8c, #c0392b, #1e8449.
- Use <text> with font-family="Georgia, 'Times New Roman', serif", font-size 14–16, for a title and axis labels; italicise variables. Keep labels clear of the curves; never let text overlap.
- Round coordinates to ≤2 decimals.`;

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

          if (isNoVisualization(svgCodeText)) {
            renderNoVis();
            return;
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

          const holder = document.createElement("div");
          holder.innerHTML = svgCode;
          const svgEl = holder.querySelector("svg");
          if (svgEl) {
            svgEl.style.maxWidth = "100%";
            svgEl.style.height = "auto";
            svgEl.style.display = "block";
            svgEl.style.margin = "0 auto";
          }
          visContainer.innerHTML = "";
          visContainer.appendChild(buildFigure(svgEl || holder, "SVG"));

        } else {
          // --- Matplotlib / Pyodide Logic ---
          updateVisLoadingUI(`Writing Matplotlib Python code via ${visModel}...`);

          const coderPrompt = `You are a world-class scientific-visualization engineer who produces publication-quality, textbook-style figures with Matplotlib + NumPy. I am providing you with a ${currentPlanText ? 'DESIGN PLAN' : 'MATH SOLUTION'}. Produce ONE clear, accurate figure that illuminates the core idea.

Source Material:
${effectiveText}

OUTPUT FORMAT (strict):
- Reply with ONE \`\`\`python ... \`\`\` block and nothing else — no prose.
- If the problem is purely arithmetic/algebraic with nothing meaningful to depict (no function, curve, shape, region, vector, distribution, or geometric configuration), reply with exactly: ${NO_VIS_TOKEN}

DIMENSIONALITY — choose deliberately:
- 2D (default): single-variable functions y=f(x), curves, shaded regions/areas, geometry, triangles/circles, number lines, vectors in the plane, bar/pie/data charts.
- 3D ONLY when inherently three-dimensional: surfaces z=f(x,y), solids of revolution, space curves, planes/vectors in R³. Use \`ax = fig.add_subplot(111, projection='3d')\`, a perceptually-uniform colormap ('viridis'/'cividis'), set a good view with \`ax.view_init(elev=22, azim=-55)\`, and label all three axes.

ACCURACY:
- Plot the ACTUAL functions, values, and points from the problem. Mark and annotate key features: intercepts, extrema, intersections, asymptotes, the shaded region, the tangent point/line, labelled angles and sides.
- Sample smoothly with NumPy (e.g. np.linspace(..., 400)). For geometry use \`matplotlib.patches\` (Circle, Polygon, Arc, FancyArrow).

PROFESSIONAL STYLE (a clean textbook style is PRE-APPLIED via rcParams — do NOT call plt.style.use or override fonts/dpi):
- Give the figure a bold title, axis labels (with units where physical), and a legend when there are multiple series.
- Use r'$…$' LaTeX in every title, label, and annotation.
- Shade regions with alpha≈0.2; use \`ax.annotate(..., arrowprops=...)\` for callouts; keep the colour set small and meaningful.
- For 2D function plots, draw light axes through the origin with \`ax.axhline(0, lw=0.8)\` and \`ax.axvline(0, lw=0.8)\` when it aids reading.

REQUIRED:
- Save with \`plt.savefig('output.png')\` (dpi and tight bbox are pre-configured). NEVER call plt.show().`;

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

          if (isNoVisualization(pyCodeText)) {
            renderNoVis();
            return;
          }

          let pythonCode = "";
          const pyRegex = /```(?:python|py)?\s*\n?([\s\S]*?)```/i;
          const pyMatch = pyRegex.exec(pyCodeText);
          pythonCode = pyMatch ? pyMatch[1].trim() : pyCodeText.replace(/```/g, "").trim();

          if (!pythonCode || (!pythonCode.includes("plt") && !pythonCode.includes("matplotlib"))) {
            console.error("Failed to extract Python code from AI response:", pyCodeText.substring(0, 500));
            throw new Error("The AI model failed to produce valid Matplotlib code. Please try regenerating.");
          }

          // Prepend the deterministic professional style so every figure looks
          // like a textbook regardless of what the model emitted.
          pythonCode = MPL_STYLE_PREAMBLE + "\n" + pythonCode;

          updateVisLoadingUI("Rendering diagram locally via Python (WebAssembly)...");
          const imgData = await runPythonInWorker(pythonCode);

          const blob = new Blob([imgData], { type: 'image/png' });
          const url = URL.createObjectURL(blob);

          const img = document.createElement("img");
          img.src = url;
          img.alt = "Generated mathematical figure";
          img.style.cssText = "max-width: 100%; height: auto; display: block; margin: 0 auto;";

          visContainer.innerHTML = "";
          visContainer.appendChild(buildFigure(img, "Matplotlib"));
        }

        // Add Regenerate button (skip it for the "no diagram needed" state)
        if (!visContainer.querySelector(".vis-none")) {
          const regenWrapper = document.createElement("div");
          regenWrapper.className = "vis-actions";
          const regenBtn = document.createElement("button");
          regenBtn.className = "btn btn-outline btn-sm";
          regenBtn.innerHTML = `<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg> Regenerate`;
          regenBtn.addEventListener("click", () => startVisualization());
          regenWrapper.appendChild(regenBtn);
          visContainer.appendChild(regenWrapper);
        }

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
    visContainer.innerHTML = `
      <div class="vis-prompt">
        <button class="btn btn-outline vis-generate-btn">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          Generate visualization
        </button>
      </div>`;
    visContainer.querySelector('button').addEventListener('click', () => startVisualization());
    scrollToBottom(true);
    updateCache();
  } else {
    startVisualization();
  }
}
