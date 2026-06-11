# MathAI — Project Context & Guidelines

MathAI is a high-performance, responsive web application for solving mathematical and physics problems using multi-modal AI models. It allows users to extract problems from images or PDFs and generates step-by-step solutions with professional LaTeX rendering and dynamic visualizations.

## 🚀 Project Overview

- **Core Purpose:** Seamless extraction and solving of math problems from visual inputs.
- **Main Technologies:** Vanilla JavaScript (ES Modules), HTML5, CSS3, Vercel Serverless Functions.
- **AI Integration:** Supports Gemini (Google), Groq, Mistral, and Ollama.
- **Mathematical Rendering:** [KaTeX](https://katex.org/) for high-quality equation typesetting.
- **Visualizations:** Dual-engine support for TikZ (via Kroki API) and Matplotlib (via Pyodide/WebAssembly in-browser).

## 🛠️ Building and Running

- **Local Development:** 
  - Requires [Vercel CLI](https://vercel.com/cli).
  - Run `vercel dev` in the root directory.
  - Access at `http://localhost:3000`.
- **Dependencies:** Most frontend libraries are loaded via CDN (see `index.html`). No `npm install` is required for the core application, though Vercel CLI manages the serverless environment.
- **Testing:** No formal test suite is currently implemented. Manual verification of AI responses and rendering is required.

## 🏗️ Architecture & Structure

The project follows a modular, state-driven architecture using vanilla JS.

- `index.html`: UI entry point, layout, and CDN dependencies.
- `style.css`: Unified styling with extensive use of CSS variables for theming.
- `js/`: core application logic.
    - `main.js`: Entry point; initializes modules and global event listeners.
    - `state.js`: Centralized application state and persistence (localStorage).
    - `dom.js`: Centralized DOM references (the `el` object).
    - `ai-service.js`: Low-level API clients for streaming AI responses.
    - `chat-engine.js`: Orchestrates the solving workflow and multi-turn chat.
    - `visualization.js`: Handles TikZ/Matplotlib code generation and rendering.
    - `file-handler.js`: Manages PDF/Image processing and canvas rendering.
    - `selection.js`: Implements the interactive crop/selection box logic.
- `api/`: Vercel serverless functions (Node.js) used as proxies to bypass CORS and handle complex API requests (e.g., `ollama.js`, `kroki.js`).

## 🎨 Development Conventions

- **Framework-Free:** Stick to Vanilla JavaScript. Do not introduce heavy frameworks (React, Vue, etc.) unless requested.
- **DOM Management:** Always use or update `js/dom.js` for element selection. Avoid direct `document.querySelector` calls in other modules.
- **State Management:** Mutate the `state` object in `js/state.js` to manage application behavior.
- **Theming:** Use CSS variables (e.g., `var(--accent)`, `var(--bg-primary)`) for all colors to ensure Light/Dark mode compatibility.
- **Error Handling:** Use the utility functions in `js/utils.js` (e.g., `showToast`, `getErrorHtml`) for consistent user feedback.
- **API Keys:** Keys are stored in `localStorage` and should never be hardcoded or committed to source control.

## 📈 Roadmap & Patterns

- **AI Agents:** The project uses a "Planner-Coder" pattern for visualizations (see `visualization.js`).
- **Vision Models:** Preference is given to models with native vision capabilities (Gemini, Pixtral, Llama 3.2 Vision).
- **PDF Handling:** Uses `pdf.js` for high-fidelity rendering of document pages to canvas.
