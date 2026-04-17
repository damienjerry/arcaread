const DEFAULTS = {
  enabled: true,
  minWordLength: 4,
  fontSizeThreshold: 14,
  fontSizeMax: 24,
  intensity: 0.5,
  processIframes: true,
  smartMode: true,
  dyslexiaMode: false,
  lineHeight: 1.6,
  letterSpacing: 0.05,
  wordSpacing: 0.1,
  readingFont: 'off',
  openPdfsInViewer: false,
  siteSettings: {}
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  if (existing.siteOverrides) {
    const siteSettings = { ...(existing.siteSettings || {}) };
    for (const [host, enabled] of Object.entries(existing.siteOverrides)) {
      siteSettings[host] = { ...(siteSettings[host] || {}), enabled };
    }
    existing.siteSettings = siteSettings;
    delete existing.siteOverrides;
    await chrome.storage.sync.remove('siteOverrides');
  }
  const merged = { ...DEFAULTS, ...existing };
  await chrome.storage.sync.set(merged);
});

// Intercept PDF navigations and send them through the BionicRead viewer.
// Only fires when the user has opted in via openPdfsInViewer. We match
// `.pdf` URLs by extension (and common query-string variants). The
// viewer's "View original" button is how users escape.
const PDF_URL_RE = /\.pdf(?:$|[?#])/i;

function isPdfLikelyUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') return false;
    return PDF_URL_RE.test(u.pathname) || PDF_URL_RE.test(u.search);
  } catch {
    return false;
  }
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // top frame only
  const url = details.url;
  if (!isPdfLikelyUrl(url)) return;
  const { openPdfsInViewer } = await chrome.storage.sync.get({ openPdfsInViewer: false });
  if (!openPdfsInViewer) return;
  const viewer = chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(url);
  chrome.tabs.update(details.tabId, { url: viewer });
});
