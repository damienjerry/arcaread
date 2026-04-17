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
  skipAppLike: false,
  focusMode: false,
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

// Reading-time analytics. Content scripts send { type: 'focusread-tick',
// seconds, host }. We aggregate per-day totals and per-host totals in
// chrome.storage.local (not synced — it'd bloat the sync quota and the
// data isn't useful across devices). Data never leaves the machine.
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function recordTick(seconds, words, host) {
  const { analytics = { total: 0, totalWords: 0, days: {}, hosts: {} } } =
    await chrome.storage.local.get({ analytics: { total: 0, totalWords: 0, days: {}, hosts: {} } });
  analytics.total = (analytics.total || 0) + seconds;
  analytics.totalWords = (analytics.totalWords || 0) + (words || 0);
  const k = todayKey();
  analytics.days[k] = (analytics.days[k] || 0) + seconds;
  if (host) {
    analytics.hosts[host] = (analytics.hosts[host] || 0) + seconds;
  }
  // Keep at most ~60 days to cap storage growth.
  const dayKeys = Object.keys(analytics.days).sort();
  if (dayKeys.length > 60) {
    for (const old of dayKeys.slice(0, dayKeys.length - 60)) delete analytics.days[old];
  }
  await chrome.storage.local.set({ analytics });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'focusread-tick' && typeof msg.seconds === 'number') {
    recordTick(msg.seconds, msg.words || 0, msg.host);
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === 'focusread-reset-analytics') {
    chrome.storage.local.set({ analytics: { total: 0, totalWords: 0, days: {}, hosts: {} } })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // top frame only
  const url = details.url;
  if (!isPdfLikelyUrl(url)) return;
  const { openPdfsInViewer } = await chrome.storage.sync.get({ openPdfsInViewer: false });
  if (!openPdfsInViewer) return;
  const viewer = chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(url);
  chrome.tabs.update(details.tabId, { url: viewer });
});
