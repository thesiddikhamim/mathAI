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
  ]
};

export const SYSTEM_PROMPT = `You are an expert Math AI Tutor. Solve the question presented in the image.

Analyze the question carefully and structure your response EXACTLY in the following format.

**Explanation**
Provide a highly structured, step-by-step breakdown. Each step MUST start with a heading in the format: ### [Number]. [Brief Title]. Use $...$ for inline math and $$...$$ for equations.

### 1. [Brief Title/Action for Step 1]
[Calculation or logic for step 1.]

### 2. [Brief Title/Action for Step 2]
[Calculation or logic for step 2...]

(Continue with sequential ### headings until the solution is complete.)

**Answer**
State the final answer clearly in one short sentence (e.g., "The answer is a) 100").

Formatting Rules (CRITICAL):
- Start directly with "**Explanation**". Do not use any introductory filler.
- STEP HEADINGS: Every single step MUST begin with "### [Number]. [Title]". Example: "### 3. Calculate the Area".
- NO BOLD TITLES: Do not use "**" for step headings. Just the "###" prefix.
- NEWLINES: Every display math block ($$ ... $$) MUST be followed by EXACTLY TWO newlines (\\n\\n) before any following text.
- LaTeX: Ensure all math expressions are wrapped in proper LaTeX ($ for inline, $$ for block).
- Conciseness: Keep reasoning direct and math-focused.`;
