export const state = {
  fileType: null, // 'image' | 'pdf'
  file: null,
  pdfDoc: null,
  curPage: 1,
  totalPages: 0,
  rawResponse: "",
  // Per-provider credentials
  apiKey: "",
  groqApiKey: "",
  mistralApiKey: "",
  ollamaApiKey: "",
  // Enabled providers
  enabledProviders: {
    gemini: true,
    ollama: true,
    mistral: true,
    groq: true
  },
  // Selected models per provider
  selectedModels: {
    gemini: ["gemini-3.1-pro-preview"],
    ollama: ["qwen3.5:cloud"],
    mistral: ["mistral-large-latest"],
    groq: ["meta-llama/llama-4-scout-17b-16e-instruct"]
  },
  enableVisualization: false,
  visEngine: "tikz", // "tikz" or "matplotlib"
  visMode: "ask", // "ask" or "auto"
  visModelConfig: "ollama:qwen3.5:cloud",
  enableVisPlanner: false,
  visPlannerModelConfig: "ollama:qwen3.5:cloud",
  visEnabledModels: ["gemini:gemini-3.1-pro-preview", "ollama:qwen3.5:cloud"],
  // Active tab ID (e.g. "gemini:gemini-3.1-pro-preview")
  activeTabId: "gemini:gemini-3.1-pro-preview",
  chatHistory: [],
  isSolved: false,
  isUserScrolledUp: false, // Track if user scrolled up during streaming
  // Cache keyed by tab ID
  answerCache: {},
  // Track running operations keyed by tab ID
  runningJobs: {},
  jobNodes: {}, // DOM elements for jobs running in the background
};

export const sel = {
  active: false, // A selection exists
  x: 0,
  y: 0, // Top-left in overlay coordinates
  w: 0,
  h: 0, // Width & height

  // Interaction
  mode: null, // 'draw' | 'move' | 'resize'
  handle: null, // Which handle is being dragged (nw,n,ne,e,se,s,sw,w)
  startX: 0,
  startY: 0,
  origX: 0,
  origY: 0,
  origW: 0,
  origH: 0,
};
