const DEFAULTS = {
  enabled: true,
  minWordLength: 4,
  fontSizeThreshold: 14,
  processIframes: true,
  smartMode: true,
  siteOverrides: {}
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  const merged = { ...DEFAULTS, ...existing };
  await chrome.storage.sync.set(merged);
});
