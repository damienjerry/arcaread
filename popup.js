const DEFAULTS = {
  enabled: true,
  minWordLength: 4,
  fontSizeThreshold: 14,
  fontSizeMax: 24,
  processIframes: true,
  smartMode: true,
  siteSettings: {}
};

// Which keys are stored per-site (in siteSettings[host]) vs global-only.
const PER_SITE_KEYS = [
  'enabled',          // per-site: active on this site
  'smartMode',
  'minWordLength',
  'fontSizeThreshold',
  'fontSizeMax'
];
// "enabled" has a dedicated global master switch; per-site "enabled"
// is read from siteSettings[host].enabled — these don't collide
// because the popup maps them to separate UI controls.

let hostname = null;
let data = null;

function $(id) { return document.getElementById(id); }

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

function siteOverrides() {
  return (hostname && data.siteSettings?.[hostname]) || {};
}

function effectiveValue(key) {
  const site = siteOverrides();
  if (site[key] !== undefined) return site[key];
  return data[key];
}

function hasAnyOverride() {
  const site = siteOverrides();
  return Object.keys(site).length > 0;
}

function updateOverrideIndicator() {
  $('overrideDot').classList.toggle('on', hasAnyOverride());
  $('reset').disabled = !hostname || !hasAnyOverride();
}

async function writeSiteOverride(key, value) {
  if (!hostname) return;
  const siteSettings = { ...(data.siteSettings || {}) };
  siteSettings[hostname] = { ...(siteSettings[hostname] || {}), [key]: value };
  data.siteSettings = siteSettings;
  await chrome.storage.sync.set({ siteSettings });
  updateOverrideIndicator();
}

async function writeGlobal(key, value) {
  data[key] = value;
  await chrome.storage.sync.set({ [key]: value });
}

async function resetSite() {
  if (!hostname) return;
  const siteSettings = { ...(data.siteSettings || {}) };
  delete siteSettings[hostname];
  data.siteSettings = siteSettings;
  await chrome.storage.sync.set({ siteSettings });
  render();
}

function render() {
  // Global-only toggles
  $('enabled').checked = data.enabled !== false;
  $('processIframes').checked = data.processIframes !== false;

  // Per-site — display effective value (global, overridden by site if set)
  const siteEnabled = siteOverrides().enabled !== false;
  $('siteEnabled').checked = hostname ? siteEnabled : false;
  $('siteEnabled').disabled = !hostname;

  const smart = effectiveValue('smartMode');
  $('smartMode').checked = smart !== false;
  $('smartMode').disabled = !hostname;

  const mwl = effectiveValue('minWordLength');
  $('minWordLength').value = mwl;
  $('minWordLengthVal').textContent = mwl;
  $('minWordLength').disabled = !hostname;

  const mft = effectiveValue('fontSizeThreshold');
  $('fontSizeThreshold').value = mft;
  $('fontSizeThresholdVal').textContent = mft;
  $('fontSizeThreshold').disabled = !hostname;

  const mfm = effectiveValue('fontSizeMax');
  $('fontSizeMax').value = mfm;
  $('fontSizeMaxVal').textContent = mfm;
  $('fontSizeMax').disabled = !hostname;

  updateOverrideIndicator();
}

async function init() {
  hostname = await getCurrentHostname();
  $('hostname').textContent = hostname || '(not a web page)';

  data = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };

  render();

  // Global toggles write to top-level keys
  $('enabled').addEventListener('change', (e) => writeGlobal('enabled', e.target.checked));
  $('processIframes').addEventListener('change', (e) => writeGlobal('processIframes', e.target.checked));

  // Per-site controls write into siteSettings[hostname]
  $('siteEnabled').addEventListener('change', (e) => writeSiteOverride('enabled', e.target.checked));
  $('smartMode').addEventListener('change', (e) => writeSiteOverride('smartMode', e.target.checked));

  $('minWordLength').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    $('minWordLengthVal').textContent = v;
    writeSiteOverride('minWordLength', v);
  });

  $('fontSizeThreshold').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    $('fontSizeThresholdVal').textContent = v;
    writeSiteOverride('fontSizeThreshold', v);
  });

  $('fontSizeMax').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    $('fontSizeMaxVal').textContent = v;
    writeSiteOverride('fontSizeMax', v);
  });

  $('reset').addEventListener('click', resetSite);
}

init();
