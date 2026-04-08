/**
 * MathAI — script.js
 * Draw a selection rectangle on an image/PDF → send cropped region
 * to Gemini Vision API → render solution with LaTeX/Markdown.
 */

'use strict';

/* ── PDF.js worker ──────────────────────────────────────── */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

/* ── DOM refs ───────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const el = {
  // Header
  darkToggle:   $('darkModeToggle'),
  sunIcon:      document.querySelector('.sun-icon'),
  moonIcon:     document.querySelector('.moon-icon'),
  settingsBtn:  $('settingsToggle'),

  // Settings
  settingsOv:   $('settingsOverlay'),
  settingsClose:$('settingsClose'),
  apiKeyInput:  $('apiKeyInput'),
  toggleKeyVis: $('toggleKeyVisibility'),
  eyeOpen:      document.querySelector('.eye-open'),
  eyeClosed:    document.querySelector('.eye-closed'),
  geminiModelSelect: $('geminiModelSelect'),
  // Groq
  groqApiKeyInput:  $('groqApiKeyInput'),
  toggleGroqKeyVis: $('toggleGroqKeyVis'),
  groqModelSelect:  $('groqModelSelect'),
  // Mistral
  mistralApiKeyInput:  $('mistralApiKeyInput'),
  toggleMistralKeyVis: $('toggleMistralKeyVis'),
  mistralModelSelect:  $('mistralModelSelect'),
  // Settings actions
  saveKey:      $('saveApiKey'),
  clearKey:     $('clearApiKey'),
  settingsSt:   $('settingsStatus'),

  // Upload
  uploadZone:   $('uploadZone'),
  fileInput:    $('fileInput'),
  fileViewer:   $('fileViewer'),
  fileIcon:     $('fileIcon'),
  fileName:     $('fileName'),
  removeFile:   $('removeFile'),

  // PDF Nav
  pdfNav:       $('pdfNav'),
  prevPage:     $('prevPage'),
  nextPage:     $('nextPage'),
  pageInfo:     $('pageInfo'),

  // Viewer
  pdfCanvas:    $('pdfCanvas'),
  imgPreview:   $('imagePreview'),
  viewerBody:   $('viewerBody'),
  hintText:     $('hintText'),

  // Selection overlay
  selOverlay:   $('selOverlay'),
  selBox:       $('selBox'),
  maskTop:      $('maskTop'),
  maskBottom:   $('maskBottom'),
  maskLeft:     $('maskLeft'),
  maskRight:    $('maskRight'),
  solveSelBtn:  $('solveSelBtn'),
  clearSelBtn:  $('clearSelBtn'),

  // Solution
  downloadBtn:  $('downloadBtn'),
  copyLatexBtn: $('copyLatexBtn'),
  copyBtn:      $('copyBtn'),
  emptyState:   $('emptyState'),
  loadingState: $('loadingState'),
  loadingSubText: $('loadingSubText'),
  solutionContent: $('solutionContent'),

  // Model switcher
  switchGemini:    $('switchGemini'),
  switchGroq:      $('switchGroq'),
  switchMistral:   $('switchMistral'),
  activeModelName: $('activeModelName'),

  // Chat
  chatContainer:$('chatContainer'),
  chatInput:    $('chatInput'),
  chatSendBtn:  $('chatSendBtn'),

  // Toast
  toast:        $('toast'),
};

/* ── App state ──────────────────────────────────────────── */
const state = {
  fileType:    null,     // 'image' | 'pdf'
  file:        null,
  pdfDoc:      null,
  curPage:     1,
  totalPages:  0,
  rawResponse: '',
  // Per-provider credentials & models
  apiKey:         '',
  groqApiKey:     '',
  mistralApiKey:  '',
  geminiModel:    'gemini-2.5-pro',
  groqModel:      'meta-llama/llama-4-scout-17b-16e-instruct',
  mistralModel:   'mistral-large-latest',
  // Active provider
  provider:    'gemini',  // 'gemini' | 'groq' | 'mistral'
  chatHistory: [],
  isSolved:    false,
  // Per-provider answer cache: { provider: { rawResponse, chatHistory, solutionHTML } }
  answerCache: {},
};

/* ── Selection state ────────────────────────────────────── */
const sel = {
  active:   false,   // A selection exists
  x: 0, y: 0,        // Top-left in overlay coordinates
  w: 0, h: 0,        // Width & height

  // Interaction
  mode:     null,    // 'draw' | 'move' | 'resize'
  handle:   null,    // Which handle is being dragged (nw,n,ne,e,se,s,sw,w)
  startX:   0, startY: 0,
  origX: 0,  origY: 0,
  origW: 0,  origH: 0,
};

const MIN_SEL = 20; // Minimum selection size in px

/* =========================================================
   UTILITY
   ========================================================= */

function showToast(msg, ms = 2800) {
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => el.toast.classList.add('show')));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.toast.classList.remove('show');
    setTimeout(() => el.toast.classList.add('hidden'), 350);
  }, ms);
}

function setSolutionState(mode) {
  el.emptyState.classList.toggle('hidden',       mode !== 'empty');
  el.loadingState.classList.toggle('hidden',     mode !== 'loading');
  el.solutionContent.classList.toggle('hidden',  mode !== 'content');
}

function enableOutputBtns() {
  [el.copyBtn, el.copyLatexBtn, el.downloadBtn].forEach(b => b.disabled = false);
}
function disableOutputBtns() {
  [el.copyBtn, el.copyLatexBtn, el.downloadBtn].forEach(b => b.disabled = true);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('✓ Copied to clipboard');
  } catch {
    const ta = Object.assign(document.createElement('textarea'), {
      value: text, style: 'position:fixed;opacity:0'
    });
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
    showToast('✓ Copied');
  }
}

/* =========================================================
   DARK MODE
   ========================================================= */

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  el.sunIcon.classList.toggle('hidden', dark);
  el.moonIcon.classList.toggle('hidden', !dark);
  localStorage.setItem('mathai-theme', dark ? 'dark' : 'light');
}

function initTheme() {
  const saved = localStorage.getItem('mathai-theme');
  const sys   = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ? saved === 'dark' : sys);
}

el.darkToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') !== 'dark');
});

/* =========================================================
   SETTINGS
   ========================================================= */

function openSettings() {
  el.apiKeyInput.value        = state.apiKey;
  el.groqApiKeyInput.value    = state.groqApiKey;
  el.mistralApiKeyInput.value = state.mistralApiKey;
  el.geminiModelSelect.value  = state.geminiModel;
  el.groqModelSelect.value    = state.groqModel;
  el.mistralModelSelect.value = state.mistralModel;
  el.settingsSt.classList.add('hidden');
  el.settingsOv.classList.remove('hidden');
  setTimeout(() => el.apiKeyInput.focus(), 80);
}
function closeSettings() {
  el.settingsOv.classList.add('hidden');
}

el.settingsBtn.addEventListener('click', openSettings);
el.settingsClose.addEventListener('click', closeSettings);
el.settingsOv.addEventListener('click', e => { if (e.target === el.settingsOv) closeSettings(); });

// Eye toggle for each provider key
function makeEyeToggle(btn, input) {
  btn.addEventListener('click', () => {
    const pw = input.type === 'password';
    input.type = pw ? 'text' : 'password';
    btn.querySelector('.eye-open').classList.toggle('hidden', pw);
    btn.querySelector('.eye-closed').classList.toggle('hidden', !pw);
  });
}
makeEyeToggle(el.toggleKeyVis,        el.apiKeyInput);
makeEyeToggle(el.toggleGroqKeyVis,    el.groqApiKeyInput);
makeEyeToggle(el.toggleMistralKeyVis, el.mistralApiKeyInput);

el.saveKey.addEventListener('click', () => {
  const gemKey     = el.apiKeyInput.value.trim();
  const groqKey    = el.groqApiKeyInput.value.trim();
  const mistralKey = el.mistralApiKeyInput.value.trim();

  if (!gemKey && !groqKey && !mistralKey) {
    showSettingsSt('Enter at least one API key.', 'error');
    return;
  }

  state.apiKey        = gemKey;
  state.groqApiKey    = groqKey;
  state.mistralApiKey = mistralKey;
  state.geminiModel   = el.geminiModelSelect.value;
  state.groqModel     = el.groqModelSelect.value;
  state.mistralModel  = el.mistralModelSelect.value;

  if (gemKey)     localStorage.setItem('mathai-apikey', gemKey);
  else            localStorage.removeItem('mathai-apikey');
  if (groqKey)    localStorage.setItem('mathai-groq-apikey', groqKey);
  else            localStorage.removeItem('mathai-groq-apikey');
  if (mistralKey) localStorage.setItem('mathai-mistral-apikey', mistralKey);
  else            localStorage.removeItem('mathai-mistral-apikey');

  localStorage.setItem('mathai-gemini-model',   state.geminiModel);
  localStorage.setItem('mathai-groq-model',     state.groqModel);
  localStorage.setItem('mathai-mistral-model',  state.mistralModel);

  updateSwitcherModelLabel();
  showSettingsSt('✓ All settings saved!', 'success');
  setTimeout(closeSettings, 1100);
});

el.clearKey.addEventListener('click', () => {
  state.apiKey = ''; state.groqApiKey = ''; state.mistralApiKey = '';
  el.apiKeyInput.value = ''; el.groqApiKeyInput.value = ''; el.mistralApiKeyInput.value = '';
  localStorage.removeItem('mathai-apikey');
  localStorage.removeItem('mathai-groq-apikey');
  localStorage.removeItem('mathai-mistral-apikey');
  showSettingsSt('All API keys cleared.', 'success');
});

function showSettingsSt(msg, type) {
  el.settingsSt.textContent = msg;
  el.settingsSt.className   = `settings-status ${type}`;
  el.settingsSt.classList.remove('hidden');
}

function loadSettings() {
  const k  = localStorage.getItem('mathai-apikey');
  const gk = localStorage.getItem('mathai-groq-apikey');
  const mk = localStorage.getItem('mathai-mistral-apikey');
  const gm = localStorage.getItem('mathai-gemini-model');
  const grm= localStorage.getItem('mathai-groq-model');
  const mm = localStorage.getItem('mathai-mistral-model');
  const pr = localStorage.getItem('mathai-provider');

  if (k)   state.apiKey        = k;
  if (gk)  state.groqApiKey    = gk;
  if (mk)  state.mistralApiKey = mk;
  if (gm)  state.geminiModel   = gm;
  if (grm) state.groqModel     = grm;
  if (mm)  state.mistralModel  = mm;
  if (pr)  state.provider      = pr;

  // Sync UI
  updateSwitcherPills();
  updateSwitcherModelLabel();
}

/* =========================================================
   FILE UPLOAD
   ========================================================= */

el.uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  el.uploadZone.classList.add('drag-over');
});
el.uploadZone.addEventListener('dragleave', () => el.uploadZone.classList.remove('drag-over'));
el.uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  el.uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
el.uploadZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); }
});
el.fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});
el.removeFile.addEventListener('click', resetFile);

function handleFile(file) {
  const ok = ['image/jpeg','image/png','application/pdf'];
  if (!ok.includes(file.type)) {
    showToast('❌ Unsupported type. Use JPG, PNG, or PDF.');
    return;
  }

  state.file     = file;
  state.rawResponse = '';
  el.fileName.textContent = file.name;
  el.uploadZone.classList.add('hidden');
  el.fileViewer.classList.remove('hidden');
  clearSelection();
  setSolutionState('empty');
  disableOutputBtns();

  if (file.type === 'application/pdf') {
    state.fileType = 'pdf';
    el.fileIcon.textContent = 'PDF';
    el.pdfCanvas.classList.remove('hidden');
    el.imgPreview.classList.add('hidden');
    el.pdfNav.classList.remove('hidden');
    loadPDF(file);
  } else {
    state.fileType = 'image';
    el.fileIcon.textContent = 'IMG';
    el.pdfCanvas.classList.add('hidden');
    el.imgPreview.classList.remove('hidden');
    el.pdfNav.classList.add('hidden');
    loadImage(file);
  }

  setHint('Drag on the image to select a question, then click Solve');
}

function resetFile() {
  state.file = null; state.pdfDoc = null;
  state.fileType = null; state.curPage = 1;
  state.rawResponse = '';

  el.fileViewer.classList.add('hidden');
  el.uploadZone.classList.remove('hidden');
  el.fileInput.value = '';
  el.imgPreview.src  = '';
  el.chatContainer.classList.add('hidden');
  clearSelection();
  setSolutionState('empty');
  disableOutputBtns();
}

function setHint(msg) {
  el.hintText.textContent = msg;
}

/* =========================================================
   IMAGE
   ========================================================= */

function loadImage(file) {
  const url = URL.createObjectURL(file);
  el.imgPreview.src = url;
  el.imgPreview.onload = () => URL.revokeObjectURL(url);
}

/* =========================================================
   PDF — PDF.js
   ========================================================= */

async function loadPDF(file) {
  const buf = await file.arrayBuffer();
  try {
    state.pdfDoc      = await pdfjsLib.getDocument({ data: buf }).promise;
    state.totalPages  = state.pdfDoc.numPages;
    state.curPage     = 1;
    await renderPDFPage(1);
  } catch (err) {
    console.error(err);
    showToast('❌ Could not load PDF.');
  }
}

async function renderPDFPage(n) {
  if (!state.pdfDoc) return;
  clearSelection();
  const page = await state.pdfDoc.getPage(n);
  const vp   = page.getViewport({ scale: 1.8 });
  const cvs  = el.pdfCanvas;
  cvs.width  = vp.width;
  cvs.height = vp.height;
  await page.render({ canvasContext: cvs.getContext('2d'), viewport: vp }).promise;
  el.pageInfo.textContent     = `${n} / ${state.totalPages}`;
  el.prevPage.disabled        = n <= 1;
  el.nextPage.disabled        = n >= state.totalPages;
}

el.prevPage.addEventListener('click', () => {
  if (state.curPage > 1) { state.curPage--; renderPDFPage(state.curPage); }
});
el.nextPage.addEventListener('click', () => {
  if (state.curPage < state.totalPages) { state.curPage++; renderPDFPage(state.curPage); }
});

/* =========================================================
   SELECTION — Draw / Move / Resize
   ========================================================= */

/**
 * We listen to pointer events on the overlay.
 * Children (.sel-box, .sel-handle) stop propagation for
 * move/resize so we know when to start a fresh draw.
 */

el.selOverlay.addEventListener('mousedown', onOverlayDown);
document.addEventListener('mousemove',      onMouseMove);
document.addEventListener('mouseup',        onMouseUp);

// Move existing selection
el.selBox.addEventListener('mousedown', e => {
  if (e.target.classList.contains('sel-handle')) return; // handled below
  e.stopPropagation();
  sel.mode    = 'move';
  sel.startX  = e.clientX;
  sel.startY  = e.clientY;
  sel.origX   = sel.x;
  sel.origY   = sel.y;
  el.selBox.style.cursor = 'grabbing';
});

// Resize via handle
el.selBox.querySelectorAll('.sel-handle').forEach(h => {
  h.addEventListener('mousedown', e => {
    e.stopPropagation();
    sel.mode   = 'resize';
    sel.handle = h.dataset.dir;
    sel.startX = e.clientX;
    sel.startY = e.clientY;
    sel.origX  = sel.x;
    sel.origY  = sel.y;
    sel.origW  = sel.w;
    sel.origH  = sel.h;
  });
});

function onOverlayDown(e) {
  if (!state.file) return;
  // Only start fresh draw on primary button
  if (e.button !== 0) return;

  // If already solved, a click on overlay (or start of new drag) 
  // signals we want to start a new question.
  if (state.isSolved) {
    state.isSolved = false;
    setSolutionState('empty');
    el.chatContainer.classList.add('hidden');
    setHint('Drag to select a new question');
  }

  const rect = el.selOverlay.getBoundingClientRect();
  sel.mode   = 'draw';
  sel.startX = e.clientX - rect.left;
  sel.startY = e.clientY - rect.top;
  sel.x = sel.startX;
  sel.y = sel.startY;
  sel.w = 0;
  sel.h = 0;
  sel.active = false;
  el.selBox.classList.add('hidden');
  hideMasks();
}

function onMouseMove(e) {
  if (!sel.mode) return;
  const rect = el.selOverlay.getBoundingClientRect();

  if (sel.mode === 'draw') {
    const mx = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const my = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);

    sel.x = Math.min(mx, sel.startX);
    sel.y = Math.min(my, sel.startY);
    sel.w = Math.abs(mx - sel.startX);
    sel.h = Math.abs(my - sel.startY);

    if (sel.w > 5 || sel.h > 5) {
      sel.active = true;
      el.selBox.classList.remove('hidden');
      renderSelection();
    }

  } else if (sel.mode === 'move') {
    const dx = e.clientX - sel.startX;
    const dy = e.clientY - sel.startY;
    sel.x = Math.max(0, Math.min(sel.origX + dx, rect.width  - sel.w));
    sel.y = Math.max(0, Math.min(sel.origY + dy, rect.height - sel.h));
    renderSelection();

  } else if (sel.mode === 'resize') {
    const dx = e.clientX - sel.startX;
    const dy = e.clientY - sel.startY;
    resizeFromHandle(sel.handle, dx, dy, rect);
    renderSelection();
  }
}

function onMouseUp() {
  if (sel.mode === 'draw') {
    if (sel.w < MIN_SEL || sel.h < MIN_SEL) {
      clearSelection();
    } else {
      sel.active = true;
      renderSelection();
      setHint('Adjust the selection, then click Solve');
    }
  }
  if (sel.mode === 'move') {
    el.selBox.style.cursor = 'move';
  }
  sel.mode   = null;
  sel.handle = null;
}

/**
 * Compute new x/y/w/h when dragging a resize handle.
 */
function resizeFromHandle(dir, dx, dy, overlayRect) {
  let { origX, origY, origW, origH } = sel;
  let x = origX, y = origY, w = origW, h = origH;

  if (dir.includes('e')) { w = Math.max(MIN_SEL, origW + dx); }
  if (dir.includes('s')) { h = Math.max(MIN_SEL, origH + dy); }
  if (dir.includes('w')) {
    const nw = Math.max(MIN_SEL, origW - dx);
    x = origX + (origW - nw); w = nw;
  }
  if (dir.includes('n')) {
    const nh = Math.max(MIN_SEL, origH - dy);
    y = origY + (origH - nh); h = nh;
  }

  // Clamp to overlay bounds
  x = Math.max(0, Math.min(x, overlayRect.width  - MIN_SEL));
  y = Math.max(0, Math.min(y, overlayRect.height - MIN_SEL));
  w = Math.min(w, overlayRect.width  - x);
  h = Math.min(h, overlayRect.height - y);

  sel.x = x; sel.y = y; sel.w = w; sel.h = h;
}

// Ensure handles have correct initial state
el.selBox.querySelectorAll('.sel-handle').forEach(h => {
  h.addEventListener('mousedown', e => {
    e.stopPropagation();
    sel.mode   = 'resize';
    sel.handle = h.dataset.dir;
    sel.startX = e.clientX;
    sel.startY = e.clientY;
    sel.origX  = sel.x;
    sel.origY  = sel.y;
    sel.origW  = sel.w;
    sel.origH  = sel.h;
  });
});

/**
 * Apply the current sel.x/y/w/h to the DOM.
 */
function renderSelection() {
  const { x, y, w, h } = sel;

  // Position the selection box
  Object.assign(el.selBox.style, {
    left:   x + 'px',
    top:    y + 'px',
    width:  w + 'px',
    height: h + 'px',
  });

  // Update dark masks
  const ov = el.selOverlay.getBoundingClientRect();
  const W  = ov.width;
  const H  = ov.height;

  Object.assign(el.maskTop.style,    { top: '0', left: '0', width: W+'px', height: y+'px' });
  Object.assign(el.maskBottom.style, { top: (y+h)+'px', left: '0', width: W+'px', height: (H-y-h)+'px' });
  Object.assign(el.maskLeft.style,   { top: y+'px', left: '0', width: x+'px', height: h+'px' });
  Object.assign(el.maskRight.style,  { top: y+'px', left: (x+w)+'px', width: (W-x-w)+'px', height: h+'px' });

  // Show masks
  [el.maskTop, el.maskBottom, el.maskLeft, el.maskRight].forEach(m => {
    m.style.display = 'block';
  });

  // Update dimension label
  updateDimLabel();

  // Flip toolbar if near bottom
  const nearBottom = (y + h + 60) > H;
  el.selBox.classList.toggle('toolbar-above', nearBottom);
}

function updateDimLabel() {
  let label = el.selBox.querySelector('.sel-dimensions');
  if (!label) {
    label = document.createElement('div');
    label.className = 'sel-dimensions';
    el.selBox.prepend(label);
  }
  label.textContent = `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
}

function hideMasks() {
  [el.maskTop, el.maskBottom, el.maskLeft, el.maskRight].forEach(m => {
    m.style.display = 'none';
  });
}

function clearSelection() {
  sel.active = false; sel.mode = null;
  sel.x = 0; sel.y = 0; sel.w = 0; sel.h = 0;
  el.selBox.classList.add('hidden');
  hideMasks();
}

el.clearSelBtn.addEventListener('click', e => {
  e.stopPropagation();
  clearSelection();
  setHint('Drag on the image to select a question');
});

/* =========================================================
   CROP THE SELECTED REGION → base64 PNG
   ========================================================= */

/**
 * Determine the source media element and compute
 * the crop rectangle in its natural pixel space.
 * Returns base64 PNG string (no prefix).
 */
function cropSelectionToBase64() {
  const tmp = document.createElement('canvas');
  const ctx = tmp.getContext('2d');

  let source, naturalW, naturalH, displayW, displayH, offsetX, offsetY;

  if (state.fileType === 'image') {
    source   = el.imgPreview;
    naturalW = source.naturalWidth;
    naturalH = source.naturalHeight;
    const r  = source.getBoundingClientRect();
    displayW = r.width;
    displayH = r.height;
    // Offset of image inside overlay
    const ov = el.selOverlay.getBoundingClientRect();
    offsetX  = r.left - ov.left;
    offsetY  = r.top  - ov.top;
  } else {
    // PDF canvas
    source   = el.pdfCanvas;
    naturalW = source.width;   // canvas pixel width (rendered at 1.8 scale)
    naturalH = source.height;
    const r  = source.getBoundingClientRect();
    displayW = r.width;
    displayH = r.height;
    const ov = el.selOverlay.getBoundingClientRect();
    offsetX  = r.left - ov.left;
    offsetY  = r.top  - ov.top;
  }

  // Scale factor: natural pixels per display pixel
  const scaleX = naturalW / displayW;
  const scaleY = naturalH / displayH;

  // Crop rect in natural pixel space
  const cropX = Math.max(0, (sel.x - offsetX) * scaleX);
  const cropY = Math.max(0, (sel.y - offsetY) * scaleY);
  const cropW = Math.min(sel.w * scaleX, naturalW - cropX);
  const cropH = Math.min(sel.h * scaleY, naturalH - cropY);

  if (cropW <= 0 || cropH <= 0) return null;

  tmp.width  = cropW;
  tmp.height = cropH;

  if (state.fileType === 'image') {
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  } else {
    ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  }

  // Return base64 without the data:image/png;base64, prefix
  return tmp.toDataURL('image/png').split(',')[1];
}

/* =========================================================
   MODEL SWITCHER
   ========================================================= */

function updateSwitcherPills() {
  [el.switchGemini, el.switchGroq, el.switchMistral].forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === state.provider);
  });
}

function updateSwitcherModelLabel() {
  const labels = {
    gemini:  state.geminiModel,
    groq:    state.groqModel,
    mistral: state.mistralModel,
  };
  el.activeModelName.textContent = labels[state.provider] || '';
}

[el.switchGemini, el.switchGroq, el.switchMistral].forEach(btn => {
  btn.addEventListener('click', () => {
    const newProvider = btn.dataset.provider;
    if (newProvider === state.provider) return;

    // Save current provider's state into cache
    if (state.isSolved) {
      state.answerCache[state.provider] = {
        rawResponse:  state.rawResponse,
        chatHistory:  [...state.chatHistory],
        solutionHTML: el.solutionContent.innerHTML,
      };
    }

    state.provider = newProvider;
    localStorage.setItem('mathai-provider', newProvider);
    updateSwitcherPills();
    updateSwitcherModelLabel();

    // Check if we have a cached answer for this provider
    const cached = state.answerCache[newProvider];
    if (cached && state.isSolved) {
      // Restore cached answer
      state.rawResponse  = cached.rawResponse;
      state.chatHistory  = cached.chatHistory;
      el.solutionContent.innerHTML = cached.solutionHTML;
      setSolutionState('content');
      enableOutputBtns();
      showToast(`↩ Restored ${newProvider} answer from cache`);
    } else if (state.isSolved) {
      // Need to re-solve with new provider
      showToast(`Switching to ${newProvider} — re-analyzing…`);
      solveSelection();
    }
  });
});

/* =========================================================
   AI SOLVE — Main dispatcher
   ========================================================= */

const SYSTEM_PROMPT = `You are an expert Math AI Tutor. Solve the question presented in the image.

Analyze the question carefully and structure your response EXACTLY in the following format.

**Answer**
State the final answer clearly in one short sentence (e.g., "The answer is a) 100").

**Explanation**
Provide a highly structured, step-by-step breakdown. Format each step with a bold, numbered heading followed by the logic.

**1. [Brief Title/Action for Step 1]**
[Calculation or logic for step 1. Use $...$ for inline math and $$...$$ for equations.]

**2. [Brief Title/Action for Step 2]**
[Calculation or logic for step 2...]

(Continue with bold numbered steps until the solution is complete.)

Rules:
- Start directly with "**Answer**". Do not use conversational filler like "Here is the solution".
- Keep the logic intuitive but extremely concise. Just the math and the direct reasoning.
- Do not waste time explaining why incorrect options are wrong.
- Ensure all math expressions are cleanly wrapped in proper LaTeX.`;

el.solveSelBtn.addEventListener('click', e => {
  e.stopPropagation();
  solveSelection();
});

async function solveSelection() {
  if (!sel.active || sel.w < MIN_SEL || sel.h < MIN_SEL) {
    showToast('Draw a selection first.');
    return;
  }

  // Validate provider has an API key
  const providerKey = {
    gemini:  state.apiKey,
    groq:    state.groqApiKey,
    mistral: state.mistralApiKey,
  }[state.provider];

  if (!providerKey) {
    const names = { gemini: 'Gemini', groq: 'Groq', mistral: 'Mistral' };
    showToast(`⚙️ Add your ${names[state.provider]} API key in Settings first.`);
    openSettings();
    return;
  }

  const base64 = cropSelectionToBase64();
  if (!base64) {
    showToast('❌ Could not capture the selection. Try again.');
    return;
  }

  setSolutionState('loading');
  disableOutputBtns();
  el.chatContainer.classList.add('hidden');
  const providerNames = { gemini: 'Gemini', groq: 'Groq', mistral: 'Mistral' };
  el.loadingSubText.textContent = `${providerNames[state.provider]} is analyzing your selection…`;
  setHint('Solving…');

  try {
    let response;

    if (state.provider === 'gemini') {
      state.chatHistory = [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            { inlineData: { mimeType: 'image/png', data: base64 } }
          ]
        }
      ];
      response = await callGeminiChat(state.chatHistory, state.apiKey, state.geminiModel);
    } else if (state.provider === 'groq') {
      response = await callGroqChat(base64, state.groqApiKey, state.groqModel);
      state.chatHistory = [
        { role: 'user',      content: SYSTEM_PROMPT + '\n[Image provided]' },
        { role: 'assistant', content: response }
      ];
    } else if (state.provider === 'mistral') {
      response = await callMistralChat(base64, state.mistralApiKey, state.mistralModel);
      state.chatHistory = [
        { role: 'user',      content: SYSTEM_PROMPT + '\n[Image provided]' },
        { role: 'assistant', content: response }
      ];
    }

    state.rawResponse = response;
    state.isSolved = true;
    // Cache this answer
    state.answerCache[state.provider] = {
      rawResponse:  response,
      chatHistory:  [...state.chatHistory],
      solutionHTML: null, // set after render
    };
    renderSolution(response);
    // Store rendered HTML in cache
    state.answerCache[state.provider].solutionHTML = el.solutionContent.innerHTML;
    enableOutputBtns();
    setHint('Done! Drag a new selection or ask a follow-up question below.');
    el.chatContainer.classList.remove('hidden');
  } catch (err) {
    setSolutionState('empty');
    showToast('❌ ' + (err.message || 'AI request failed.'));
    console.error('AI error:', err);
    setHint('Something went wrong. Try again.');
  }
}

// Handle follow-up chat
el.chatSendBtn.addEventListener('click', sendFollowUp);
el.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendFollowUp();
});

async function sendFollowUp() {
  const text = el.chatInput.value.trim();
  if (!text) return;
  el.chatInput.value = '';

  appendUserMessage(text);

  const providerKey = {
    gemini:  state.apiKey,
    groq:    state.groqApiKey,
    mistral: state.mistralApiKey,
  }[state.provider];

  disableOutputBtns();
  try {
    let response;
    if (state.provider === 'gemini') {
      state.chatHistory.push({ role: 'user', parts: [{ text }] });
      response = await callGeminiChat(state.chatHistory, providerKey, state.geminiModel);
      state.chatHistory.push({ role: 'model', parts: [{ text: response }] });
    } else if (state.provider === 'groq') {
      state.chatHistory.push({ role: 'user', content: text });
      response = await callGroqFollowUp(state.chatHistory, providerKey, state.groqModel);
      state.chatHistory.push({ role: 'assistant', content: response });
    } else if (state.provider === 'mistral') {
      state.chatHistory.push({ role: 'user', content: text });
      response = await callMistralFollowUp(state.chatHistory, providerKey, state.mistralModel);
      state.chatHistory.push({ role: 'assistant', content: response });
    }

    state.rawResponse += '\n\n' + response;
    appendAIMessage(response);
    // Update cache
    if (state.answerCache[state.provider]) {
      state.answerCache[state.provider].rawResponse  = state.rawResponse;
      state.answerCache[state.provider].chatHistory  = [...state.chatHistory];
      state.answerCache[state.provider].solutionHTML = el.solutionContent.innerHTML;
    }
  } catch (err) {
    showToast('❌ Follow-up request failed.');
    console.error(err);
  } finally {
    enableOutputBtns();
  }
}

/**
 * Multi-turn Gemini API call
 */
async function callGeminiChat(contents, apiKey, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: contents,
    generationConfig: {
      temperature:     0.25,
      topP:            0.95,
      maxOutputTokens: 8192,
    }
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini.');
  return text;
}

/**
 * Groq vision/text call — sends image as base64 in the content
 */
async function callGroqChat(base64, apiKey, model) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  // Determine if this model likely supports vision
  const visionModels = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];
  const supportsVision = visionModels.includes(model);

  let messages;
  if (supportsVision) {
    messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: SYSTEM_PROMPT },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } }
        ]
      }
    ];
  } else {
    // Text-only fallback — describe the image ourselves via Gemini won't work,
    // so we embed the base64 image URL style
    messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: SYSTEM_PROMPT },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } }
        ]
      }
    ];
  }

  const body = {
    model,
    messages,
    temperature:     0.25,
    max_tokens:      8192,
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq.');
  return text;
}

/**
 * Groq follow-up (text-only conversation)
 */
async function callGroqFollowUp(messages, apiKey, model) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const body = { model, messages, temperature: 0.25, max_tokens: 8192 };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/**
 * Mistral vision call — Pixtral models support vision
 */
async function callMistralChat(base64, apiKey, model) {
  const url = 'https://api.mistral.ai/v1/chat/completions';

  // Pixtral models support vision
  const visionModels = ['pixtral-large-latest', 'pixtral-12b-2409'];
  const supportsVision = visionModels.includes(model);

  let content;
  if (supportsVision) {
    content = [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'image_url', image_url: `data:image/png;base64,${base64}` }
    ];
  } else {
    // For text-only Mistral models, we can still pass image_url format
    // (Mistral API handles it gracefully or ignores non-vision-capable parts)
    content = [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'image_url', image_url: `data:image/png;base64,${base64}` }
    ];
  }

  const body = {
    model,
    messages: [{ role: 'user', content }],
    temperature: 0.25,
    max_tokens:  8192,
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Mistral HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Mistral.');
  return text;
}

/**
 * Mistral follow-up (text conversation)
 */
async function callMistralFollowUp(messages, apiKey, model) {
  const url = 'https://api.mistral.ai/v1/chat/completions';
  // Convert content arrays to strings for follow-up
  const cleanMessages = messages.map(m => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content.filter(c => c.type === 'text').map(c => c.text).join(' ')
      : m.content,
  }));
  const body = { model, messages: cleanMessages, temperature: 0.25, max_tokens: 8192 };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Mistral HTTP ${res.status}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/* =========================================================
   RENDER SOLUTION — Markdown + KaTeX
   ========================================================= */

function renderMarkdown(raw, container) {
  marked.setOptions({ breaks: true, gfm: true });
  container.innerHTML = marked.parse(raw);

  if (typeof renderMathInElement !== 'undefined') {
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true  },
        { left: '$',  right: '$',  display: false },
        { left: '\\[', right: '\\]', display: true  },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  }
}

function renderSolution(raw) {
  setSolutionState('content');
  el.solutionContent.innerHTML = '';
  
  const aiMsg = document.createElement('div');
  aiMsg.className = 'chat-msg-ai';
  el.solutionContent.appendChild(aiMsg);
  renderMarkdown(raw, aiMsg);

  el.solutionContent.parentElement.scrollTop = 0;
}

function appendUserMessage(text) {
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg-user';
  userMsg.textContent = text;
  el.solutionContent.appendChild(userMsg);
  scrollToBottom();
}

function appendAIMessage(raw) {
  const aiMsg = document.createElement('div');
  aiMsg.className = 'chat-msg-ai';
  el.solutionContent.appendChild(aiMsg);
  renderMarkdown(raw, aiMsg);
  scrollToBottom();
}

function scrollToBottom() {
  el.solutionContent.parentElement.scrollTop = el.solutionContent.parentElement.scrollHeight;
}

/* =========================================================
   OUTPUT BUTTONS
   ========================================================= */

el.copyBtn.addEventListener('click', () => {
  copyText(el.solutionContent.innerText || '');
});

el.copyLatexBtn.addEventListener('click', () => {
  if (!state.rawResponse) return;
  copyText(state.rawResponse);
  showToast('✓ LaTeX / Markdown source copied!');
});

el.downloadBtn.addEventListener('click', async () => {
  if (!state.rawResponse) return;
  try {
    showToast('⏳ Generating PDF…');
    await html2pdf().set({
      margin:     [12, 14],
      filename:   'MathAI-Solution.pdf',
      image:      { type: 'jpeg', quality: 0.96 },
      html2canvas:{ scale: 2, useCORS: true },
      jsPDF:      { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(el.solutionContent).save();
    showToast('✓ PDF saved!');
  } catch (err) {
    showToast('❌ PDF generation failed.');
    console.error(err);
  }
});

/* =========================================================
   PANEL RESIZE (drag divider)
   ========================================================= */

(function initPanelResize() {
  const divider = $('panelDivider');
  const left    = $('leftPanel');
  const layout  = document.querySelector('.main-layout');
  let drag = false, startX = 0, startW = 0;

  divider.addEventListener('mousedown', e => {
    if (window.innerWidth <= 768) return;
    drag   = true; startX = e.clientX;
    startW = left.getBoundingClientRect().width;
    divider.classList.add('dragging');
    document.body.style.cssText += ';cursor:col-resize;user-select:none';
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    const total = layout.getBoundingClientRect().width;
    const nw    = Math.min(Math.max(startW + e.clientX - startX, total * 0.2), total * 0.8);
    left.style.flex  = `0 0 ${(nw/total*100).toFixed(2)}%`;
    left.style.width = `${(nw/total*100).toFixed(2)}%`;
  });
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    drag = false;
    divider.classList.remove('dragging');
    document.body.style.cursor    = '';
    document.body.style.userSelect = '';
  });
})();

/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!el.settingsOv.classList.contains('hidden')) closeSettings();
    else clearSelection();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault(); openSettings();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (sel.active) solveSelection();
  }
});

/* =========================================================
   INIT
   ========================================================= */

function waitForKaTeX(cb, n = 0) {
  if (typeof renderMathInElement !== 'undefined') cb();
  else if (n < 40) setTimeout(() => waitForKaTeX(cb, n + 1), 250);
}

function init() {
  initTheme();
  loadSettings();
  setSolutionState('empty');
  disableOutputBtns();
  console.info('%cMathAI ready.\nCtrl+K = Settings | Ctrl+Enter = Solve | Esc = Clear', 'font-weight:bold');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => waitForKaTeX(init));
} else {
  waitForKaTeX(init);
}
