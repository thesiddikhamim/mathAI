
## 🌐 Live Demo

Try it yourself: **[https://mathai.siddikhamim.com](https://mathai.siddikhamim.com)**

---
## 🎨 User Interface

![MathAI Visualization Settings](docs/UI.png)

The visualization engine selector now includes three options:
1. **TikZ (Kroki API)** - Textbook-quality LaTeX diagrams compiled via Kroki
2. **Matplotlib (Local/Offline)** - Python-based diagrams rendered in browser via WebAssembly
3. **Direct SVG (AI Generated)** - NEW! AI directly generates SVG code for instant rendering

---

## 🔑 Getting Free API Keys

To use MathAI, you'll need at least one free API key from the supported providers:

### Google Gemini (Recommended - Best for SVG)
- **Free Tier**: ✅ Yes - Generous free quota
- **Get Your Key**: [https://ai.google.dev/gemini-api/docs/api-key](https://ai.google.dev/gemini-api/docs/api-key)
- **Steps**:
  1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
  2. Click "Get API Key" or "Create API Key"
  3. Copy your key (starts with `AIza...`)
- **Best For**: Direct SVG generation, complex visualizations

### Groq (Fastest Inference)
- **Free Tier**: ✅ Yes - Fast inference speeds
- **Get Your Key**: [https://console.groq.com/keys](https://console.groq.com/keys)
- **Steps**:
  1. Sign up at [Groq Console](https://console.groq.com)
  2. Navigate to API Keys section
  3. Create a new API key
  4. Copy your key (starts with `gsk_...`)
- **Best For**: Quick responses, testing

### Mistral AI
- **Free Tier**:  ✅ Yes - Trial credits provided
- **Get Your Key**: [https://console.mistral.ai/api-keys](https://console.mistral.ai/api-keys)
- **Steps**:
  1. Sign up at [Mistral Console](https://console.mistral.ai)
  2. Go to API Keys
  3. Create new key
  4. Copy your key
- **Best For**: European users, privacy-focused

### Ollama Cloud
- **Free Tier**: ✅ Yes - Community models available
- **Get Your Key**: [https://ollama.com/cloud](https://ollama.com/cloud)
- **Steps**:
  1. Sign up at Ollama Cloud
  2. Generate API key from dashboard
  3. Copy your key
- **Best For**: Open-source models, Qwen variants

### 💡 Quick Setup
1. Get at least one free API key from above (Gemini recommended)
2. Open [https://mathai.siddikhamim.com](https://mathai.siddikhamim.com)
3. Click Settings ⚙️ → API Keys
4. Paste your key(s)
5. Click "Save All Settings"
6. Start solving math problems! 🎉

---


## ✨ Key Benefits

### 🚀 **Performance**
- **No external API calls** - Unlike TikZ which requires Kroki API compilation
- **No WebAssembly overhead** - Unlike Matplotlib which loads Pyodide (Python runtime)
- **Instant rendering** - SVG is rendered directly in the browser DOM
- **Lightweight** - Minimal processing required

### 🎯 **Flexibility**
- **Full AI control** - The AI has complete creative freedom over the visualization
- **Works with Planner Agent** - If enabled, the Visualization Planner first creates a design strategy, then the coder implements it as SVG
- **Dynamic content** - Can generate complex, adaptive visualizations based on problem context

### 🔧 **Reliability**
- **No compilation errors** - Eliminates LaTeX compilation failures or Python runtime issues
- **Graceful degradation** - Multiple fallback extraction strategies
- **Better error messages** - Clear feedback when generation fails with console logging for debugging

---

## 🛠️ How It Works

### Step-by-Step Process

1. **User selects a math problem** from an uploaded image/PDF
2. **AI generates step-by-step solution** with detailed mathematical explanation
3. **Visualization is triggered** (automatically or on user request)

#### When "Direct SVG" is selected:

**Phase 1: Design Planning (Optional)**
- If **Visualization Planner Agent** is enabled:
  - Planner AI analyzes the solution
  - Creates a detailed design plan describing:
    - What to visualize (e.g., "3D surface plot", "geometric diagram")
    - Visualization type (2D Graph, 3D Surface, Geometry, Flowchart)
    - Label placement and annotations
    - Visual strategy for maximum clarity

**Phase 2: SVG Code Generation**
- The selected coding model receives either:
  - The design plan (if planner is enabled)
  - The original solution (if planner is disabled)
- AI generates complete SVG code following professional standards:
  ```svg
  <svg viewBox="0 0 800 600" width="800" height="600" xmlns="http://www.w3.org/2000/svg">
    <!-- Background -->
    <rect width="800" height="600" fill="white"/>
    
    <!-- Axes -->
    <line x1="50" y1="300" x2="750" y2="300" stroke="black" stroke-width="2"/>
    <line x1="400" y1="50" x2="400" y2="550" stroke="black" stroke-width="2"/>
    
    <!-- Mathematical elements -->
    <circle cx="400" cy="300" r="100" fill="none" stroke="#4169E1" stroke-width="2"/>
    
    <!-- Labels -->
    <text x="400" y="280" text-anchor="middle" font-size="16">Circle: x² + y² = r²</text>
  </svg>
  ```

**Phase 3: Extraction & Rendering**
- Robust multi-strategy extraction:
  1. Attempts to extract from code blocks (````svg`, ````xml`, ````html`)
  2. Falls back to searching for `<svg>` tags directly
  3. Last resort: removes all backticks and parses remaining content
- SVG is validated (must contain `<svg>` tag)
- Rendered inline with responsive styling
- "Regenerate Image" button appears for retry capability

---

## 📋 Technical Implementation

### Architecture Changes

#### 1. **HTML (index.html)**
Added new radio button option in Visualization Settings:
```html
<label class="model-checkbox-label">
  <input type="radio" name="visEngineRadio" id="visEngineSvg" class="model-radio" value="svg">
  Direct SVG (AI Generated)
</label>
```

#### 2. **State Management (js/state.js)**
```javascript
visEngine: "tikz", // "tikz" or "matplotlib" or "svg"
```

#### 3. **DOM References (js/dom.js)**
```javascript
visEngineSvg: $("visEngineSvg"),
```

#### 4. **Event Handlers (js/main.js, js/settings.js)**
```javascript
el.visEngineSvg.addEventListener("change", (e) => {
  if (e.target.checked) state.visEngine = "svg";
});
```

#### 5. **Visualization Engine (js/visualization.js)**

**SVG Generation Prompt:**
```javascript
const coderPrompt = `You are an expert SVG visualization coder for mathematical diagrams.
I am providing you with a ${currentPlanText ? 'DESIGN PLAN' : 'MATH SOLUTION'}. 
Your task is to implement this visualization directly as SVG code.

Source Material:
${effectiveText}

Rules for Professional Math Diagrams:
1. STRICT FORMATTING: ONLY output valid SVG code within a \`\`\`svg ... \`\`\` block.
2. SVG STRUCTURE:
   - Set appropriate viewBox and dimensions
   - Use clean white or transparent background
   - Include xmlns="http://www.w3.org/2000/svg"
3. MATHEMATICAL ELEMENTS:
   - Use <path>, <line>, <circle>, <rect>, <polygon>
   - Use <text> for labels with mathematical notation
   - Add <marker> elements for arrows
4. STYLING:
   - Professional academic colors
   - Appropriate stroke-width, fill, opacity
   - Clear labels and annotations
5. QUALITY:
   - Precise coordinates
   - Scalable and clean
   - Consistent styling
`;
```

**Robust Extraction Logic:**
```javascript
let svgCode = "";
const svgRegex = /```(?:svg|xml|html)?\s*\n?([\s\S]*?)```/i;
const svgMatch = svgRegex.exec(svgCodeText);

if (svgMatch && svgMatch[1].trim().length > 0) {
  svgCode = svgMatch[1].trim();
} else {
  // Fallback: Extract <svg> tags directly
  const svgStartIdx = svgCodeText.indexOf("<svg");
  const svgEndIdx = svgCodeText.lastIndexOf("</svg>");
  
  if (svgStartIdx !== -1 && svgEndIdx !== -1) {
    svgCode = svgCodeText.substring(svgStartIdx, svgEndIdx + "</svg>".length);
  } else {
    svgCode = svgCodeText.replace(/```/g, "").trim();
  }
}

if (!svgCode || !svgCode.includes("<svg")) {
  console.error("Failed to extract SVG code from AI response:", svgCodeText.substring(0, 500));
  throw new Error("The AI model failed to produce valid SVG code. Please try regenerating.");
}
```

**Rendering:**
```javascript
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
```

---

## 🔍 Extraction Improvements

All three visualization engines now have improved code extraction with these enhancements:

### TikZ Extraction
- ✅ Case-insensitive regex for `latex`, `tikz`, `tex` blocks
- ✅ Multiple fallback strategies (code blocks → direct search → strip backticks)
- ✅ Auto-wrapping for axis-only code
- ✅ Accepts `\begin{tikzpicture}` OR `\begin{axis}`
- ✅ Console logging for debugging

### SVG Extraction
- ✅ Handles `svg`, `xml`, `html` code blocks
- ✅ Tolerant whitespace handling
- ✅ Direct `<svg>` tag extraction
- ✅ Console logging for debugging

### Matplotlib Extraction
- ✅ Handles `python` and `py` code blocks
- ✅ Validates for both `plt` and `matplotlib`
- ✅ Console logging for debugging

---

## 🎯 Use Cases

### Best for:
- **Quick visualizations** where speed matters
- **Custom diagrams** that don't fit standard LaTeX packages
- **Interactive-style graphics** with dynamic layouts
- **When APIs are unavailable** or rate-limited
- **Simple to moderate complexity** diagrams

### Consider alternatives when:
- **Publication-quality typesetting** is required → Use TikZ
- **Complex 3D plots** with matplotlib syntax → Use Matplotlib
- **Precise mathematical notation** in labels → Use TikZ with LaTeX

---

## 📊 Comparison Table

| Feature | TikZ (Kroki API) | Matplotlib (Local) | Direct SVG (NEW) |
|---------|------------------|-------------------|------------------|
| **Quality** | ⭐⭐⭐⭐⭐ Textbook | ⭐⭐⭐⭐ High | ⭐⭐⭐⭐ High |
| **Speed** | ⭐⭐⭐ Moderate | ⭐⭐ Slow | ⭐⭐⭐⭐⭐ Instant |
| **Dependencies** | Kroki API | Pyodide (WebAssembly) | None |
| **Offline Support** | ❌ No | ✅ Yes | ✅ Yes |
| **LaTeX Support** | ✅ Native | ⚠️ Limited | ⚠️ Limited |
| **3D Graphics** | ✅ Yes | ✅ Yes | ⚠️ Limited |
| **Flexibility** | ⭐⭐⭐ Good | ⭐⭐⭐⭐ High | ⭐⭐⭐⭐⭐ Full |
| **Error Rate** | ⭐⭐⭐ Moderate | ⭐⭐⭐⭐ Low | ⭐⭐⭐⭐ Low |

---

## 🚦 Configuration

### Enable Visualization

1. Open **Settings** (⚙️ icon)
2. Go to **Visualization** tab
3. Toggle **Enable AI Visualization** to ON

### Select Direct SVG Engine

1. Under **Visualization Engine**, select:
   - ⚪ TikZ (Kroki API)
   - ⚪ Matplotlib (Local/Offline)
   - 🔘 **Direct SVG (AI Generated)**

### Visualization Mode

Choose when to generate visualizations:
- **Ask Each Time**: Button appears, you click to generate
- **Auto**: Automatically generates with each solution

### Visualization Planner Agent (Optional)

Toggle **Visualization Planner Agent** to enable two-phase generation:
1. Planner creates design strategy
2. Coder implements the design

Select models for both planner and coder roles.

### Enable for Specific Models

Under **Enable Visualization for Selected Chat Models**, check which chat models should trigger visualization generation.

---

## 🐛 Troubleshooting

### "The AI model failed to produce valid SVG code"

**Causes:**
- AI generated text instead of SVG
- Malformed SVG syntax
- AI wrapped SVG in wrong code block type

**Solutions:**
1. Click **Regenerate Image** button
2. Try a different AI model (some models are better at SVG)
3. Enable **Visualization Planner Agent** for better results
4. Check browser console for logged AI response (first 500 chars)

### SVG appears but looks wrong

**Causes:**
- Incorrect viewBox dimensions
- Missing styling
- Overlapping elements

**Solutions:**
1. Click **Regenerate Image** to get a new version
2. Try adding more context to your problem description
3. Consider using TikZ for complex mathematical notation

### No visualization appears

**Causes:**
- Visualization not enabled for current model
- Visualization mode set to "Ask" but button not clicked
- API key missing for selected model

**Solutions:**
1. Check Settings → Visualization tab
2. Ensure model is checked under "Enable Visualization for Selected Chat Models"
3. Verify API keys in Settings → API Keys tab

---

## 🔮 Future Enhancements

Potential improvements for Direct SVG feature:
- [ ] SVG animation support for dynamic diagrams
- [ ] MathML integration for better mathematical notation
- [ ] Interactive SVG elements (hover tooltips, clickable regions)
- [ ] SVG optimization/minification
- [ ] Template-based SVG generation for common diagram types
- [ ] Export individual SVG files

---

## 📝 Code Example

**Full workflow in code:**

```javascript
// User selects visualization engine
state.visEngine = "svg";

// AI generates solution
const solution = await aiModel.solve(problemImage);

// Visualization is triggered
if (state.enableVisualization && state.visEnabledModels.includes(currentModel)) {
  // Optional: Planner phase
  if (state.enableVisPlanner) {
    const designPlan = await plannerModel.generatePlan(solution);
  }
  
  // SVG generation phase
  const svgPrompt = createSVGPrompt(designPlan || solution);
  const svgResponse = await codingModel.generate(svgPrompt);
  
  // Extraction with fallbacks
  let svgCode = extractFromCodeBlock(svgResponse) 
    || extractFromTags(svgResponse) 
    || stripBackticks(svgResponse);
  
  // Validation
  if (!svgCode.includes("<svg")) {
    throw new Error("Invalid SVG");
  }
  
  // Render
  container.innerHTML = svgCode;
  styleSVG(container.querySelector("svg"));
}
```

---

## 🤝 Contributing

Found a bug or have a feature request? 

- **Live Demo**: [https://mathai.siddikhamim.com](https://mathai.siddikhamim.com)
- **Report Issues**: Open an issue on GitHub
- **Suggest Improvements**: Pull requests welcome!

---

## 📄 License

This feature is part of the MathAI project. See main LICENSE file for details.

---

**Built with ❤️ for the math education community**

*Making AI-powered math visualization accessible to everyone*
