const DEFAULTS = {
  enabled: true,
  minWordLength: 4,
  fontSizeThreshold: 14,
  fontSizeMax: 24,
  processIframes: true,
  smartMode: true,
  siteSettings: {}
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  // Legacy migration: fold siteOverrides into siteSettings.
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
