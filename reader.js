// Reader View logic. Reads an article payload from chrome.storage.session
// (written by popup.js after content.js extracts it), renders it with
// FocusCore applied, and provides TTS + tint controls.

const params = new URLSearchParams(location.search);
const articleId = params.get('id');

const statusEl = document.getElementById('status');
const titleEl = document.getElementById('title');
const metaEl = document.getElementById('meta');
const articleEl = document.getElementById('article');
const srcEl = document.getElementById('src');
const playBtn = document.getElementById('play');
const tintSel = document.getElementById('tint');
const exitBtn = document.getElementById('exit');
const summarizeBtn = document.getElementById('summarize');
const summaryBox = document.getElementById('summary');
const summaryText = document.getElementById('summaryText');

function setStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.className = isError ? 'err' : 'status';
  statusEl.style.display = msg ? 'block' : 'none';
}

// ---------- Bionic transformation of the extracted DOM ----------

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'TT',
  'SVG', 'MATH', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED'
]);

function bionicifyText(root, settings) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const textNode of nodes) {
    const text = textNode.nodeValue;
    const { segments, modified } = FocusCore.transform(text, settings);
    if (!modified) continue;
    const wrapper = document.createElement('span');
    wrapper.innerHTML = FocusCore.toHtml(segments);
    textNode.parentNode.replaceChild(wrapper, textNode);
  }
}

// ---------- TTS (Web Speech API) ----------

let utterance = null;
let paragraphs = [];
let speakingIdx = -1;

function collectParagraphs() {
  paragraphs = Array.from(articleEl.querySelectorAll('p, li, h1, h2, h3, h4, blockquote'));
}

function highlightParagraph(idx) {
  if (speakingIdx >= 0 && paragraphs[speakingIdx]) {
    paragraphs[speakingIdx].classList.remove('speaking');
  }
  speakingIdx = idx;
  if (idx >= 0 && paragraphs[idx]) {
    paragraphs[idx].classList.add('speaking');
    paragraphs[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function speakFrom(startIdx) {
  window.speechSynthesis.cancel();
  if (startIdx >= paragraphs.length) {
    highlightParagraph(-1);
    playBtn.textContent = '▶';
    return;
  }
  const text = paragraphs[startIdx]?.textContent?.trim();
  if (!text) {
    speakFrom(startIdx + 1);
    return;
  }
  utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.onstart = () => highlightParagraph(startIdx);
  utterance.onend = () => speakFrom(startIdx + 1);
  utterance.onerror = () => speakFrom(startIdx + 1);
  window.speechSynthesis.speak(utterance);
}

playBtn.addEventListener('click', () => {
  const s = window.speechSynthesis;
  if (s.speaking && !s.paused) {
    s.pause();
    playBtn.textContent = '▶';
  } else if (s.paused) {
    s.resume();
    playBtn.textContent = '❚❚';
  } else {
    if (!paragraphs.length) collectParagraphs();
    if (!paragraphs.length) {
      setStatus('Nothing to read aloud.', true);
      return;
    }
    playBtn.textContent = '❚❚';
    speakFrom(0);
  }
});

// Ensure speech stops if the user leaves or closes.
window.addEventListener('beforeunload', () => window.speechSynthesis.cancel());

// ---------- Tint ----------

const TINT_KEY = 'focusread-reader-tint';

function applyTint(value) {
  const cls = document.documentElement.classList;
  for (const c of Array.from(cls)) {
    if (c.startsWith('tint-')) cls.remove(c);
  }
  if (value && value !== 'off') cls.add('tint-' + value);
  try { localStorage.setItem(TINT_KEY, value); } catch {}
}

tintSel.addEventListener('change', (e) => applyTint(e.target.value));

(function initTint() {
  try {
    const saved = localStorage.getItem(TINT_KEY) || 'off';
    tintSel.value = saved;
    applyTint(saved);
  } catch {}
})();

// ---------- Summarize (Chrome on-device AI) ----------

// Chrome exposes window.ai in Chrome 127+ when the Gemini Nano model is
// available. The API is still stabilising so we feature-detect defensively
// and show a clear message rather than a broken button on other browsers.
async function getSummarizer() {
  const root = self;
  const ns = root.ai?.summarizer || root.Summarizer || root.ai;
  if (!ns) return { reason: 'Chrome on-device AI is not available in this browser. Requires Chrome 127+ with Gemini Nano enabled.' };
  try {
    if (typeof ns.availability === 'function') {
      const status = await ns.availability();
      if (status === 'unavailable' || status === 'no') {
        return { reason: 'On-device AI is not available on this machine yet.' };
      }
    } else if (typeof ns.capabilities === 'function') {
      const caps = await ns.capabilities();
      if (caps.available === 'no') {
        return { reason: 'On-device AI is not available on this machine yet.' };
      }
    }
    const create = ns.create?.bind(ns) || root.ai?.summarizer?.create;
    if (!create) return { reason: 'Summarizer API not present.' };
    const summarizer = await create({
      type: 'tldr',
      format: 'plain-text',
      length: 'medium',
      expectedInputLanguages: ['en'],
      outputLanguage: 'en'
    });
    return { summarizer };
  } catch (e) {
    return { reason: `AI init failed: ${e.message || e}` };
  }
}

async function runSummarize() {
  const rawText = (articleEl.textContent || '').replace(/\s+/g, ' ').trim();
  if (!rawText) return;
  summarizeBtn.disabled = true;
  summarizeBtn.textContent = 'Thinking…';
  summaryBox.hidden = false;
  summaryText.textContent = 'Starting…';

  const { summarizer, reason } = await getSummarizer();
  if (!summarizer) {
    summaryText.textContent = reason;
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = 'Summarize';
    return;
  }

  try {
    const cleaned = cleanForSummary(rawText);
    // Decide how much to feed Nano in one pass. Ask the model directly
    // when it supports measurement; otherwise use a conservative cap.
    const cap = await inputCapChars(summarizer, cleaned);
    const truncated = cleaned.length > cap;
    const input = truncated ? cleaned.slice(0, cap) : cleaned;

    const out = await streamingSummarize(summarizer, input, (partial) => {
      // Render progressively so the user sees output within a second or two.
      summaryText.textContent = partial;
    });
    summaryText.textContent = out;
    const { segments } = FocusCore.transform(out, bionicSettings);
    summaryText.innerHTML = FocusCore.toHtml(segments);
    if (truncated) {
      const note = document.createElement('div');
      note.style.cssText = 'margin-top:10px;font-size:11px;color:var(--muted);font-family:-apple-system,sans-serif;font-style:italic;';
      note.textContent = `Summarised from the first ~${Math.round(cap / 1000)}k characters of a longer article.`;
      summaryText.appendChild(note);
    }
  } catch (e) {
    summaryText.textContent = `Couldn't summarise: ${e.message || e}`;
  } finally {
    summarizer.destroy?.();
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = 'Summarize';
  }
}

async function inputCapChars(summarizer, text) {
  // Summarizer.inputQuota is token-based in the spec. Measure a sample
  // and convert. Fall back to 6000 chars if the API isn't available.
  try {
    if (typeof summarizer.measureInputUsage === 'function' && summarizer.inputQuota) {
      const sample = text.slice(0, 2000);
      const used = await summarizer.measureInputUsage(sample);
      if (used > 0) {
        const charsPerToken = sample.length / used;
        return Math.floor(summarizer.inputQuota * charsPerToken * 0.9);
      }
    }
  } catch {}
  return 6000;
}

async function streamingSummarize(summarizer, text, onPartial) {
  // Streaming makes the first words appear within a second or two,
  // which matters more than total elapsed time for perceived speed.
  if (typeof summarizer.summarizeStreaming === 'function') {
    const stream = summarizer.summarizeStreaming(text);
    let buffer = '';
    try {
      // Newer Chrome returns an async iterable of incremental text.
      for await (const chunk of stream) {
        // Some builds emit deltas, some emit the full-so-far text.
        buffer = chunk.length > buffer.length ? chunk : buffer + chunk;
        onPartial?.(buffer);
      }
      return buffer || text.slice(0, 200);
    } catch (e) {
      // Fallthrough to non-streaming.
    }
  }
  return summarizer.summarize(text);
}

// Strip markers and chrome that waste Nano's context without adding
// information — citation brackets, footnote refs, stray bracketed
// annotations (e.g. "[edit]", "[citation needed]"), and truncate the
// text at boilerplate headings Wikipedia/news sites use to end the
// article body (References, See also, etc.).
const TAIL_HEADING_RE =
  /\b(References|Bibliography|External links|See also|Further reading|Notes|Citations|Sources|Footnotes|Works cited|Related articles|Comments)\b/i;

function cleanForSummary(text) {
  let t = text
    .replace(/\[\d+\]/g, '')
    .replace(/\[[^\]]{1,24}\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cutoff = t.search(TAIL_HEADING_RE);
  // Only truncate if the boilerplate heading appears well past the
  // lede — otherwise a passing mention ("references to Homer") would
  // lop off the whole article.
  if (cutoff > 400) t = t.slice(0, cutoff).trim();
  return t;
}

summarizeBtn.addEventListener('click', runSummarize);

exitBtn.addEventListener('click', () => {
  window.speechSynthesis.cancel();
  stopChunks();
  // Try to jump back to the original URL, else close.
  const url = articleEl.dataset.origin;
  if (url) location.href = url;
  else window.close();
});

// ---------- Chunk mode (RSVP with bionic) ----------

const chunkView = document.getElementById('chunkView');
const chunkDisplay = document.getElementById('chunkDisplay');
const chunkPosEl = document.getElementById('chunkPos');
const chunkTotalEl = document.getElementById('chunkTotal');
const chunkPlayBtn = document.getElementById('chunkPlay');
const chunkBackBtn = document.getElementById('chunkBack');
const chunkNextBtn = document.getElementById('chunkNext');
const chunkCloseBtn = document.getElementById('chunkClose');
const chunkSizeSel = document.getElementById('chunkSize');
const chunkWpmInput = document.getElementById('chunkWpm');
const chunkWpmVal = document.getElementById('chunkWpmVal');
const chunksBtn = document.getElementById('chunks');

let chunkWords = [];
let chunkIdx = 0;
let chunkTimer = null;
let lastChunkSize = 2;
let bionicSettings = { minWordLength: 4, intensity: 0.5 };

function chunkSize() { return parseInt(chunkSizeSel.value, 10) || 2; }
function chunkWpm() { return parseInt(chunkWpmInput.value, 10) || 300; }
function chunkIntervalMs() {
  // WPM refers to individual words regardless of chunk grouping, so a
  // chunk of N words dwells for N * (60 / WPM) * 1000 ms.
  return Math.max(80, chunkSize() * (60 / chunkWpm()) * 1000);
}
function chunkTotal() {
  const size = chunkSize();
  return Math.max(1, Math.ceil(chunkWords.length / size));
}

function buildChunkWords() {
  const text = (articleEl.textContent || '').replace(/\s+/g, ' ').trim();
  chunkWords = text.split(' ').filter(Boolean);
}

function renderChunk() {
  const size = chunkSize();
  const slice = chunkWords.slice(chunkIdx * size, chunkIdx * size + size);
  if (!slice.length) {
    pauseChunks();
    return;
  }
  const joined = slice.join(' ');
  const { segments } = FocusCore.transform(joined, bionicSettings);
  chunkDisplay.innerHTML = FocusCore.toHtml(segments);
  chunkPosEl.textContent = String(chunkIdx + 1);
  chunkTotalEl.textContent = String(chunkTotal());
}

function stepChunk() {
  chunkIdx++;
  if (chunkIdx >= chunkTotal()) {
    chunkIdx = chunkTotal() - 1;
    pauseChunks();
    return;
  }
  renderChunk();
}

function playChunks() {
  if (!chunkWords.length) buildChunkWords();
  if (!chunkWords.length) return;
  if (chunkTimer) clearInterval(chunkTimer);
  chunkTimer = setInterval(stepChunk, chunkIntervalMs());
  chunkPlayBtn.textContent = '❚❚';
}

function pauseChunks() {
  if (chunkTimer) { clearInterval(chunkTimer); chunkTimer = null; }
  chunkPlayBtn.textContent = '▶';
}

function stopChunks() {
  pauseChunks();
  chunkView.hidden = true;
}

function openChunks() {
  buildChunkWords();
  if (!chunkWords.length) { setStatus('Nothing to chunk.', true); return; }
  chunkIdx = 0;
  chunkView.hidden = false;
  renderChunk();
}

chunksBtn.addEventListener('click', openChunks);
chunkCloseBtn.addEventListener('click', stopChunks);
chunkPlayBtn.addEventListener('click', () => {
  chunkTimer ? pauseChunks() : playChunks();
});
chunkBackBtn.addEventListener('click', () => {
  pauseChunks();
  chunkIdx = Math.max(0, chunkIdx - 1);
  renderChunk();
});
chunkNextBtn.addEventListener('click', () => {
  pauseChunks();
  chunkIdx = Math.min(chunkTotal() - 1, chunkIdx + 1);
  renderChunk();
});
chunkSizeSel.addEventListener('change', () => {
  // Preserve approximate reading position across chunk-size changes.
  // The dropdown has already updated, so we need the *previous* size —
  // tracked in lastChunkSize.
  const wordPos = chunkIdx * lastChunkSize;
  lastChunkSize = chunkSize();
  chunkIdx = Math.floor(wordPos / lastChunkSize);
  renderChunk();
  if (chunkTimer) playChunks();
});
chunkWpmInput.addEventListener('input', (e) => {
  chunkWpmVal.textContent = e.target.value;
  if (chunkTimer) playChunks();
});
// Spacebar toggles play/pause while in chunk mode.
document.addEventListener('keydown', (e) => {
  if (chunkView.hidden) return;
  if (e.code === 'Space') { e.preventDefault(); chunkTimer ? pauseChunks() : playChunks(); }
  else if (e.code === 'ArrowLeft') { pauseChunks(); chunkBackBtn.click(); }
  else if (e.code === 'ArrowRight') { pauseChunks(); chunkNextBtn.click(); }
  else if (e.code === 'Escape') stopChunks();
});

// ---------- Load + render ----------

async function loadSettings(host) {
  try {
    const data = await chrome.storage.sync.get(null);
    const site = (host && data.siteSettings?.[host]) || {};
    return {
      minWordLength: site.minWordLength ?? data.minWordLength ?? 4,
      intensity: site.intensity ?? data.intensity ?? 0.5
    };
  } catch {
    return { minWordLength: 4, intensity: 0.5 };
  }
}

function estimateMinutes(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

async function render() {
  if (!articleId) {
    setStatus('No article handle. Open from the extension popup.', true);
    return;
  }
  const key = 'article:' + articleId;
  const stash = await chrome.storage.session.get(key);
  const payload = stash[key];
  if (!payload) {
    setStatus('Article data not found (it may have expired). Try again from the popup.', true);
    return;
  }
  // One-shot: clear after reading so the session store doesn't grow.
  chrome.storage.session.remove(key);

  document.title = (payload.title || 'Arcaread') + ' — Arcaread';
  titleEl.textContent = payload.title || '';
  srcEl.textContent = payload.host || payload.url || '';
  articleEl.dataset.origin = payload.url || '';

  articleEl.innerHTML = payload.html || '';
  const plainText = articleEl.textContent || '';
  const mins = estimateMinutes(plainText);
  metaEl.innerHTML = `<a href="${payload.url}" style="color: inherit">${payload.host}</a> · ${mins} min read${payload.detected ? '' : ' · (no article detected — showing page content)'}`;

  const settings = await loadSettings(payload.host);
  bionicSettings = settings;
  bionicifyText(articleEl, settings);
  collectParagraphs();
  setStatus('');
  // Article is ready; unlock the toolbar actions that depend on it.
  summarizeBtn.disabled = false;
  document.getElementById('chunks').disabled = false;
  playBtn.disabled = false;
}

render();
