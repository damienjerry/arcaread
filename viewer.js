// PDF reader: fetches the PDF at ?file=<url>, extracts per-page text with
// pdf.js, groups lines into paragraphs by vertical gap, and renders each
// paragraph with FocusCore.transform applied. Not a perfect clone of the
// PDF's layout — this is a reading view, not a document viewer.

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.js');

const params = new URLSearchParams(location.search);
const pdfUrl = params.get('file');
const statusEl = document.getElementById('status');
const pagesEl = document.getElementById('pages');
const srcEl = document.getElementById('src');
const originalBtn = document.getElementById('original');

srcEl.textContent = pdfUrl || '(no file)';
originalBtn.addEventListener('click', () => {
  if (pdfUrl) location.href = pdfUrl;
});

const DEFAULTS = {
  minWordLength: 4,
  intensity: 0.5
};

async function loadSettings() {
  try {
    const host = pdfUrl ? new URL(pdfUrl).hostname : '';
    const data = await chrome.storage.sync.get(null);
    const site = (data.siteSettings && data.siteSettings[host]) || {};
    return {
      minWordLength: site.minWordLength ?? data.minWordLength ?? DEFAULTS.minWordLength,
      intensity: site.intensity ?? data.intensity ?? DEFAULTS.intensity
    };
  } catch {
    return DEFAULTS;
  }
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? 'err' : 'status';
  statusEl.style.display = msg ? 'block' : 'none';
}

// Group pdf.js text items into paragraphs. Each item has {str, transform,
// hasEOL}. Lines are at distinct y-positions; a jump larger than a line
// height signals a paragraph break.
function itemsToParagraphs(items) {
  if (!items.length) return [];
  const lines = [];
  let currentLine = null;
  let currentY = null;
  for (const it of items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5]);
    if (currentY === null || Math.abs(y - currentY) > 2) {
      currentLine = { y, text: '' };
      lines.push(currentLine);
      currentY = y;
    }
    const needsSpace = currentLine.text && !currentLine.text.endsWith(' ') && !it.str.startsWith(' ');
    currentLine.text += (needsSpace ? ' ' : '') + it.str;
  }
  lines.sort((a, b) => b.y - a.y);

  const paragraphs = [];
  let current = '';
  let prevY = null;
  let avgGap = 0;
  const gaps = [];
  for (let i = 1; i < lines.length; i++) {
    gaps.push(Math.abs(lines[i - 1].y - lines[i].y));
  }
  if (gaps.length) {
    gaps.sort((a, b) => a - b);
    avgGap = gaps[Math.floor(gaps.length / 2)];
  }

  for (const line of lines) {
    if (prevY !== null) {
      const gap = Math.abs(prevY - line.y);
      if (gap > avgGap * 1.6) {
        if (current.trim()) paragraphs.push(current.trim());
        current = '';
      }
    }
    current += (current && !current.endsWith(' ') ? ' ' : '') + line.text;
    prevY = line.y;
  }
  if (current.trim()) paragraphs.push(current.trim());
  return paragraphs;
}

function renderParagraph(text, settings) {
  const { segments } = FocusCore.transform(text, settings);
  const p = document.createElement('p');
  p.className = 'para';
  p.innerHTML = FocusCore.toHtml(segments);
  return p;
}

async function renderPdf() {
  if (!pdfUrl) {
    setStatus('No PDF specified. Add ?file=<url> to this viewer.', true);
    return;
  }
  const settings = await loadSettings();
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise;
  } catch (e) {
    setStatus(`Failed to load PDF: ${e.message || e}`, true);
    return;
  }
  setStatus(`Rendering ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}…`);

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const paragraphs = itemsToParagraphs(content.items);

    const pageDiv = document.createElement('section');
    pageDiv.className = 'page';
    const label = document.createElement('div');
    label.className = 'page-num';
    label.textContent = `Page ${i}`;
    pageDiv.appendChild(label);

    for (const para of paragraphs) {
      pageDiv.appendChild(renderParagraph(para, settings));
    }
    pagesEl.appendChild(pageDiv);
  }
  setStatus('');
}

renderPdf();
