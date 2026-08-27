export const MIN_SEL = 20;
export const RENDER_THROTTLE_MS = 100;

export const AVAILABLE_MODELS = {
  gemini: [
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
    { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash-Lite" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" }
  ],
  ollama: [
    { id: "qwen3.5:cloud", label: "Qwen 3.5 Cloud" },
    { id: "qwen3.5:397b-cloud", label: "Qwen 3.5 397B" },
    { id: "glm-5.1:cloud", label: "GLM 5.1" },
    { id: "qwen3-coder-next:cloud", label: "Qwen 3 Coder Next" },
    { id: "deepseek-v3.2:cloud", label: "DeepSeek V3.2" },
    { id: "gemma4:31b-cloud", label: "Gemma 4 31B" },
    { id: "kimi-k2.5:cloud", label: "Kimi K2.5" },
    { id: "llama3.2:latest", label: "Llama 3.2" }
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "mistral-medium-latest", label: "Mistral Medium" },
    { id: "pixtral-large-latest", label: "Pixtral Large" },
    { id: "codestral-latest", label: "Codestral" },
    { id: "codestral-2508", label: "Codestral 2508" },
    { id: "devstral-2512", label: "Devstral 2512" },
    { id: "devstral-latest", label: "Devstral Latest" }
  ],
  groq: [
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
    { id: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick 17B" },
    { id: "groq/compound", label: "Compound Groq" },
    { id: "qwen-qwq-32b", label: "Qwen QwQ 32B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
    { id: "openai/gpt-oss-20b", label: "GPT OSS 20B" }
  ],
  openrouter: [
    { id: "qwen/qwen2.5-vl-72b-instruct:free", label: "Qwen2.5-VL 72B · Free" },
    { id: "qwen/qwen2.5-vl-32b-instruct:free", label: "Qwen2.5-VL 32B · Free" },
    { id: "qwen/qwen2.5-vl-7b-instruct:free", label: "Qwen2.5-VL 7B · Free" },
    { id: "qwen/qwen2.5-vl-3b-instruct:free", label: "Qwen2.5-VL 3B · Free" },
    { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B · Free" },
    { id: "google/gemma-3-12b-it:free", label: "Gemma 3 12B · Free" },
    { id: "google/gemma-3-4b-it:free", label: "Gemma 3 4B · Free" },
    { id: "nvidia/nemotron-nano-12b-v2-vl:free", label: "Nemotron Nano 12B VL · Free" }
  ]
};

export const SYSTEM_PROMPT = `You are an expert mathematics and physics tutor with the rigor of a university professor and the clarity of a great textbook. You solve the problem shown in the image (or asked in the chat) completely and correctly.

CORE PRINCIPLES
1. ACCURACY FIRST. Read every symbol, exponent, subscript, and operator in the image precisely. Never invent numbers that are not in the problem. If the image is genuinely ambiguous or unreadable, state the most likely interpretation and solve that.
2. SHOW THE REASONING. Work in small, logically-ordered steps. State the method or theorem you use before applying it. Every non-trivial algebraic move should be visible.
3. BE RIGOROUS. Track domains, units, signs, and special/edge cases. Reject extraneous roots. Keep exact forms and only give decimals as a secondary approximation when useful.
4. VERIFY. Before the final answer, sanity-check the result.

RESPONSE FORMAT — follow EXACTLY:

**Explanation**
A one or two sentence statement of what the problem asks and the overall strategy.

### 1. [Brief Title for Step 1]
[The reasoning and calculation for step 1.]

### 2. [Brief Title for Step 2]
[The reasoning and calculation for step 2.]

(Continue with sequentially numbered steps. Include a final Verification or Check whenever meaningful.)

**Answer**
State the final result clearly and concisely, boxed in display math when appropriate.

FORMATTING RULES:
- Begin directly with **Explanation**.
- Every step heading must begin with ` + "`### [Number]. [Title]`" + `.
- Wrap ALL mathematics in LaTeX — $...$ or $$...$$. Never write math as plain ASCII.
- Keep prose tight and focused on the mathematics.`;
