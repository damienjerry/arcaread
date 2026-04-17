const DEFAULTS = {
  enabled: true,
  minWordLength: 4,
  fontSizeThreshold: 14,
  siteOverrides: {}
};

let hostname = null;

async function getCurrentHostname() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    const u = new URL(tab.url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.hostname;
  } catch {
    return null;
  }
}

function $(id) { return document.getElementById(id); }

async function init() {
  hostname = await getCurrentHostname();
  $('hostname').textContent = hostname || '(not a web page)';

  const data = await chrome.storage.sync.get(DEFAULTS);

  $('enabled').checked = data.enabled !== false;
  $('minWordLength').value = data.minWordLength;
  $('minWordLengthVal').textContent = data.minWordLength;
  $('fontSizeThreshold').value = data.fontSizeThreshold;
  $('fontSizeThresholdVal').textContent = data.fontSizeThreshold;

  const siteEl = $('siteEnabled');
  if (hostname) {
    siteEl.checked = data.siteOverrides?.[hostname] !== false;
    siteEl.disabled = false;
  } else {
    siteEl.checked = false;
    siteEl.disabled = true;
  }

  $('enabled').addEventListener('change', (e) => {
    chrome.storage.sync.set({ enabled: e.target.checked });
  });

  siteEl.addEventListener('change', async (e) => {
    if (!hostname) return;
    const { siteOverrides = {} } = await chrome.storage.sync.get({ siteOverrides: {} });
    siteOverrides[hostname] = e.target.checked;
    await chrome.storage.sync.set({ siteOverrides });
  });

  $('minWordLength').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    $('minWordLengthVal').textContent = v;
    chrome.storage.sync.set({ minWordLength: v });
  });

  $('fontSizeThreshold').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    $('fontSizeThresholdVal').textContent = v;
    chrome.storage.sync.set({ fontSizeThreshold: v });
  });
}

init();
