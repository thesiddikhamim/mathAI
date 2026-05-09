import { state } from './state.js';
import { el } from './dom.js';
import { copyText, showToast } from './utils.js';
import { cropSelectionToBase64 } from './selection.js';

export function initExporter() {
  el.copyBtn.addEventListener("click", () => {
    copyText(el.solutionContent.innerText || "");
  });

  el.copyLatexBtn.addEventListener("click", () => {
    if (!state.rawResponse) return;
    copyText(state.rawResponse);
    showToast("✓ LaTeX / Markdown source copied!");
  });

  el.downloadBtn.addEventListener("click", async () => {
    if (!state.rawResponse) return;

    try {
      showToast("⏳ Generating professional report…");

      // 1. Prepare data
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const currentTabId = state.activeTabId;
      if(!currentTabId) return;
      const [currentProvider, currentModel] = currentTabId.split(":");

      const providerNames = {
        gemini: "Gemini",
        groq: "Groq",
        mistral: "Mistral",
        ollama: "Ollama"
      };
      
      // 2. Populate template
      el.pdfDate.textContent = dateStr;
      el.pdfModel.textContent = `Model: ${providerNames[currentProvider]} ${currentModel}`;

      // Get high-quality crop
      const cropBase64 = cropSelectionToBase64();
      if (cropBase64) {
        el.pdfQuestionImg.src = `data:image/png;base64,${cropBase64}`;
      }

      // Clone solution content and clean up (remove animations, etc.)
      el.pdfSolutionContent.innerHTML = el.solutionContent.innerHTML;

      // Ensure math is rendered (it should be as we clone innerHTML, but sometimes KaTeX needs help)
      // Wait a bit for the image to load in the hidden template
      await new Promise((r) => setTimeout(r, 100));

      // 3. Generate PDF
      const opt = {
        margin: [10, 10],
        filename: `MathAI-Solution-${now.getTime()}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          backgroundColor: "#ffffff",
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };

      // Temporarily show the template (but off-screen or zero height) for capturing
      // html2pdf works best if the element is in the DOM and visible (but can be hidden via clip/position)
      el.pdfTemplate.classList.remove("hidden");

      await html2pdf().set(opt).from(el.pdfTemplate).save();

      el.pdfTemplate.classList.add("hidden");
      showToast("✓ Solution report saved!");
    } catch (err) {
      showToast("PDF generation failed.");
      console.error("PDF Error:", err);
      el.pdfTemplate.classList.add("hidden");
    }
  });
}
