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

exitBtn.addEventListener('click', () => {
  window.speechSynthesis.cancel();
  // Try to jump back to the original URL, else close.
  const url = articleEl.dataset.origin;
  if (url) location.href = url;
  else window.close();
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

  document.title = (payload.title || 'FocusRead') + ' — FocusRead';
  titleEl.textContent = payload.title || '';
  srcEl.textContent = payload.host || payload.url || '';
  articleEl.dataset.origin = payload.url || '';

  articleEl.innerHTML = payload.html || '';
  const plainText = articleEl.textContent || '';
  const mins = estimateMinutes(plainText);
  metaEl.innerHTML = `<a href="${payload.url}" style="color: inherit">${payload.host}</a> · ${mins} min read${payload.detected ? '' : ' · (no article detected — showing page content)'}`;

  const settings = await loadSettings(payload.host);
  bionicifyText(articleEl, settings);
  collectParagraphs();
  setStatus('');
}

render();
