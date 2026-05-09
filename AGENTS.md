# MathAI Agent Instructions

MathAI is an intelligent, responsive web application for extracting mathematical problems from images or PDFs and generating step-by-step solutions with AI models.

## Architecture

- **Frontend Core**: Vanilla JS (Modular ES6), HTML (`index.html`), and CSS (`style.css`). No heavy frontend frameworks (e.g., React, Vue) are used.
  - **Modules (`js/`)**:
    - `main.js`: Entry point. Initializes the app and binds global event listeners.
    - `config.js`: Shared constants, model lists, and system prompts.
    - `state.js`: Global application state (`state`) and selection state (`sel`).
    - `dom.js`: Centralized DOM element references (`el`) and `$` selector utility.
    - `ai-service.js`: Low-level API client logic for various AI providers (Gemini, Groq, Mistral, Ollama).
    - `chat-engine.js`: High-level AI coordination for solving selections and handling follow-up chat.
    - `selection.js`: Logic for the selection rectangle (draw, move, resize, crop).
    - `renderer.js`: Handles Markdown parsing (Marked) and LaTeX rendering (KaTeX).
    - `visualization.js`: Coordinates TikZ/PGFPlots design and compilation via Kroki API.
    - `file-handler.js`: Manages image loading and PDF parsing/rendering (PDF.js).
    - `settings.js`: Manages the settings modal, API keys, and model configuration.
    - `carousel.js`: Handles the model switcher UI and tab-specific answer caching.
    - `exporter.js`: Manages PDF report generation (html2pdf) and clipboard actions.
    - `mobile.js`: Mobile-specific touch interactions and panel switching.
    - `ui-manager.js`: Generic UI helpers for hints, status, and layout adjustments.
    - `theme.js`: Dark/Light mode synchronization.
    - `utils.js`: Common utilities like toasts, scroll management, and stream processing.
- **Backend/Proxy**: Vercel Serverless Functions (`api/ollama.js`, `api/kroki.js`) to handle CORS for API routes. 
- **DOM Manipulation**: Done directly via Vanilla JS (e.g. `const $ = (id) => document.getElementById(id)`).
- **Libraries**:
  - `pdf.js` for PDF parsing.
  - `KaTeX` for pure math rendering.
  - `html2pdf.js` for PDF exporting.
  - `Kroki` API (via `api/kroki.js` proxy) for compiling LaTeX/TikZ code into scalable vector graphics (SVG).

## Build & Test Commands

- **Local Development**: Run `vercel dev` in your terminal to start the Vercel local dev server and ensure the serverless proxies (like `api/ollama.js` and `api/kroki.js`) function correctly.

## Conventions
- Use pure Vanilla JavaScript for frontend logic. Do not install or introduce frontend frameworks.
- Ensure all AI streaming logic handles chunking and respects the minimal UI updates needed.
- Respect the existing UI theme layout, utilizing the standard CSS variables defined in `style.css`.
- If modifying math rendering, use the initialized KaTeX patterns.
- Read [README.md](./README.md) for full feature details and model provider integration info.
