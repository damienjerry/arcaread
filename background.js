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

// Keyboard shortcut: toggle the per-site enabled flag for the active tab.
// Flipping siteSettings[host].enabled is picked up by the content script's
// storage.onChanged listener and applied without a reload.
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'toggle-site') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  let host;
  try {
    const u = new URL(tab.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    host = u.hostname;
  } catch {
    return;
  }
  const { siteSettings = {} } = await chrome.storage.sync.get({ siteSettings: {} });
  const site = siteSettings[host] || {};
  const next = { ...site, enabled: site.enabled === false };
  await chrome.storage.sync.set({ siteSettings: { ...siteSettings, [host]: next } });
});

// Intercept PDF navigations and send them through the FocusRead viewer.
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
