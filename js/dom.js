export const $ = (id) => document.getElementById(id);

export const el = {
  // Header
  darkToggle: $("darkModeToggle"),
  sunIcon: document.querySelector(".sun-icon"),
  moonIcon: document.querySelector(".moon-icon"),
  settingsBtn: $("settingsToggle"),

  // Settings
  settingsOv: $("settingsOverlay"),
  settingsClose: $("settingsClose"),
  tabApiKeys: $("tabApiKeys"),
  tabModels: $("tabModels"),
  tabVisualization: $("tabVisualization"),
  apiKeysView: $("apiKeysView"),
  modelsView: $("modelsView"),
  visualizationView: $("visualizationView"),
  enableVisualization: $("enableVisualization"),
  visEngineTikz: $("visEngineTikz"),
  visEngineMatplotlib: $("visEngineMatplotlib"),
  visModelsWrapper: $("visModelsWrapper"),
  visModelsContainer: $("visModelsContainer"),
  visEnabledModelsContainer: $("visEnabledModelsContainer"),
  visModeAsk: $("visModeAsk"),
  visModeAuto: $("visModeAuto"),
  enableVisPlanner: $("enableVisPlanner"),
  visPlannerModelsWrapper: $("visPlannerModelsWrapper"),
  visPlannerModelsContainer: $("visPlannerModelsContainer"),

  apiKeyInput: $("apiKeyInput"),
  toggleKeyVis: $("toggleKeyVisibility"),
  eyeOpen: document.querySelector(".eye-open"),
  eyeClosed: document.querySelector(".eye-closed"),

  // Groq
  groqApiKeyInput: $("groqApiKeyInput"),
  toggleGroqKeyVis: $("toggleGroqKeyVis"),
  
  // Mistral
  mistralApiKeyInput: $("mistralApiKeyInput"),
  toggleMistralKeyVis: $("toggleMistralKeyVis"),
  
  // Ollama
  ollamaApiKeyInput: $("ollamaApiKeyInput"),
  toggleOllamaKeyVis: $("toggleOllamaKeyVis"),
  // Settings actions
  saveKey: $("saveApiKey"),
  clearKey: $("clearApiKey"),
  settingsSt: $("settingsStatus"),

  // Upload
  uploadZone: $("uploadZone"),
  fileInput: $("fileInput"),
  fileViewer: $("fileViewer"),
  fileIcon: $("fileIcon"),
  fileName: $("fileName"),
  removeFile: $("removeFile"),

  // PDF Nav
  pdfNav: $("pdfNav"),
  prevPage: $("prevPage"),
  nextPage: $("nextPage"),
  pageInput: $("pageInput"),
  pageTotal: $("pageTotal"),

  // Viewer
  pdfCanvas: $("pdfCanvas"),
  imgPreview: $("imagePreview"),
  viewerBody: $("viewerBody"),
  hintText: $("hintText"),

  // Selection overlay
  selOverlay: $("selOverlay"),
  selBox: $("selBox"),
  maskTop: $("maskTop"),
  maskBottom: $("maskBottom"),
  maskLeft: $("maskLeft"),
  maskRight: $("maskRight"),
  solveSelBtn: $("solveSelBtn"),
  solveAllBtn: $("solveAllBtn"),
  clearSelBtn: $("clearSelBtn"),

  // Solution
  downloadBtn: $("downloadBtn"),
  copyLatexBtn: $("copyLatexBtn"),
  copyBtn: $("copyBtn"),
  emptyState: $("emptyState"),
  loadingState: $("loadingState"),
  loadingSubText: $("loadingSubText"),
  errorActions: $("errorActions"),
  tryAgainBtn: $("tryAgainBtn"),
  emptySubText: $("emptySubText"),
  solutionContent: $("solutionContent"),

  // Carousel Switcher
  modelCarousel: $("modelCarousel"),

  // Chat
  chatContainer: $("chatContainer"),
  chatInput: $("chatInput"),
  chatSendBtn: $("chatSendBtn"),
  chatRegenerateBtn: $("chatRegenerateBtn"),

  // Toast
  toast: $("toast"),

  // PDF Template
  pdfTemplate: $("pdfTemplate"),
  pdfDate: $("pdfDate"),
  pdfModel: $("pdfModel"),
  pdfQuestionImg: $("pdfQuestionImg"),
  pdfSolutionContent: $("pdfSolutionContent"),
};
