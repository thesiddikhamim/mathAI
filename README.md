# ∑ MathAI — AI-Powered Math Solver

MathAI is an intelligent, responsive web application that allows users to seamlessly extract mathematical problems from images or PDFs and generate highly detailed, step-by-step solutions using leading AI models.

Built entirely as a client-side application (with a lightweight API proxy), MathAI brings textbook-quality explanations and vector-based mathematical diagrams directly to your browser.

## ✨ Features

- **Multi-Modal AI Solving:** Select an area of an image or PDF, and AI will interpret the math problem and provide a structured, step-by-step explanation.
- **Provider Support:** Seamlessly switch between multiple AI providers:
  - **Gemini** (Google)
  - **Groq** (Llama variants)
  - **Mistral** (Pixtral/Mistral variants)
  - **Ollama Cloud** (Qwen variants)
- **Publication-Quality Visualizations:** MathAI dynamically prompts the AI to generate **LaTeX TikZ** code for geometric setups, graphs, and physics diagrams. These diagrams are compiled instantly via the [Kroki API](https://kroki.io) into crisp, scalable SVG vector graphics directly in the chat!
- **LaTeX Math Rendering:** All equations are safely rendered in real-time using [KaTeX](https://katex.org/), ensuring professional typographical standards (e.g., $E=mc^2$).
- **PDF Export:** Click a single button to cleanly export your AI-generated solution and crop-region into an elegant, styled PDF report.
- **Dark/Light Mode:** Full theming support.

## 🚀 How it Works

1. **Upload:** Drag and drop an image or PDF containing a math or physics problem.
2. **Select:** Draw a bounding box around the specific problem you want solved.
3. **Solve:** Select your preferred AI model. The app extracts the crop, passes it to the Vision-capable AI, and streams a structured markdown response.
4. **Visualize:** If enabled, the AI will write a `.tikz` graphics payload representing the problem's mathematical setup. The app strips the structural context safely, compiles the TikZ script via a fast Web API, and renders an SVG.

## 🛠️ Setup & Installation

Since MathAI is primarily a frontend application, you just need to serve the files. It includes a serverless function (`api/ollama.js`) to handle CORS for Ollama's cloud API.

### Local Development (Vercel CLI)

To test locally (including proxying the Ollama endpoints properly to bypass CORS):

```bash
# 1. Install the Vercel CLI globally
npm i -g vercel

# 2. Run the local dev server
vercel dev
```

### Usage
- Open `http://localhost:3000`.
- Use the **Settings (⚙️)** menu in the UI to manage your API keys (Gemini, Groq, Mistral, Ollama) and select your active models.

## 🧠 Technology Stack

- **Frontend:** Pure HTML, CSS, Vanilla JavaScript (No heavy frameworks!).
- **PDF Parsing:** `pdf.js` by Mozilla.
- **Math Rendering:** `KaTeX`
- **Markdown Parsing:** `Marked.js`
- **Visualization:** LaTeX / TikZ -> Compiled via [Kroki](https://kroki.io/).
- **Exporting:** `html2pdf.js`
- **Backend/Proxy:** Vercel Serverless Functions (`/api/ollama.js`).