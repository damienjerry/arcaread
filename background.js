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
