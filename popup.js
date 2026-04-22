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

const SAMPLE_TEXT =
  'Reading is a conversation with an author. The first half of each word often carries most of its identity.';

function renderPreview() {
  const { segments } = FocusCore.transform(SAMPLE_TEXT, {
    minWordLength: effectiveValue('minWordLength'),
    intensity: effectiveValue('intensity')
  });
  $('preview').innerHTML = FocusCore.toHtml(segments);
}

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
  $('openPdfsInViewer').checked = data.openPdfsInViewer === true;

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

  const intensity = effectiveValue('intensity');
  $('intensity').value = Math.round(intensity * 100);
  $('intensityVal').textContent = Math.round(intensity * 100);
  $('intensity').disabled = !hostname;

  const dys = effectiveValue('dyslexiaMode') === true;
  $('dyslexiaMode').checked = dys;
  $('dyslexiaMode').disabled = !hostname;

  const lh = effectiveValue('lineHeight');
  $('lineHeight').value = Math.round(lh * 10);
  $('lineHeightVal').textContent = lh.toFixed(1);
  $('lineHeight').disabled = !hostname || !dys;

  const ls = effectiveValue('letterSpacing');
  $('letterSpacing').value = Math.round(ls * 100);
  $('letterSpacingVal').textContent = ls.toFixed(2);
  $('letterSpacing').disabled = !hostname || !dys;

  const ws = effectiveValue('wordSpacing');
  $('wordSpacing').value = Math.round(ws * 100);
  $('wordSpacingVal').textContent = ws.toFixed(2);
  $('wordSpacing').disabled = !hostname || !dys;

  const font = effectiveValue('readingFont') || 'off';
  $('readingFont').value = font;
  $('readingFont').disabled = !hostname;

  $('skipAppLike').checked = effectiveValue('skipAppLike') === true;
  $('skipAppLike').disabled = !hostname;

  $('focusMode').checked = effectiveValue('focusMode') === true;
  $('focusMode').disabled = !hostname;

  renderPreview();
  updateOverrideIndicator();
  renderAnalytics();
}

function formatMinutes(seconds) {
  if (!seconds || seconds < 60) return `${Math.round(seconds || 0)}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
}

async function renderAnalytics() {
  const { analytics = { total: 0, totalWords: 0, days: {} } } =
    await chrome.storage.local.get({ analytics: { total: 0, totalWords: 0, days: {} } });
  const today = analytics.days[todayKey()] || 0;
  $('statToday').textContent = formatMinutes(today);
  $('statTotal').textContent = formatMinutes(analytics.total || 0);
  // WPM = words processed per minute of active reading. Displayed only
  // once we have enough signal (>60s) to avoid early nonsense.
  const seconds = analytics.total || 0;
  const words = analytics.totalWords || 0;
  if (seconds > 60 && words > 0) {
    $('statWpm').textContent = String(Math.round(words / (seconds / 60)));
  } else {
    $('statWpm').textContent = '—';
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function init() {
  hostname = await getCurrentHostname();
  $('hostname').textContent = hostname || '(not a web page)';

  data = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };

  render();

  // Global toggles write to top-level keys
  $('enabled').addEventListener('change', (e) => writeGlobal('enabled', e.target.checked));
  $('processIframes').addEventListener('change', (e) => writeGlobal('processIframes', e.target.checked));
  $('openPdfsInViewer').addEventListener('change', (e) => writeGlobal('openPdfsInViewer', e.target.checked));

  // Per-site controls write into siteSettings[hostname]
  $('siteEnabled').addEventListener('change', (e) => writeSiteOverride('enabled', e.target.checked));
  $('smartMode').addEventListener('change', (e) => writeSiteOverride('smartMode', e.target.checked));

  $('minWordLength').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    $('minWordLengthVal').textContent = v;
    writeSiteOverride('minWordLength', v);
    renderPreview();
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

  $('intensity').addEventListener('input', (e) => {
    const pct = parseInt(e.target.value, 10);
    $('intensityVal').textContent = pct;
    writeSiteOverride('intensity', pct / 100);
    renderPreview();
  });

  $('dyslexiaMode').addEventListener('change', async (e) => {
    await writeSiteOverride('dyslexiaMode', e.target.checked);
    render();
  });

  $('lineHeight').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10) / 10;
    $('lineHeightVal').textContent = v.toFixed(1);
    writeSiteOverride('lineHeight', v);
  });

  $('letterSpacing').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10) / 100;
    $('letterSpacingVal').textContent = v.toFixed(2);
    writeSiteOverride('letterSpacing', v);
  });

  $('wordSpacing').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10) / 100;
    $('wordSpacingVal').textContent = v.toFixed(2);
    writeSiteOverride('wordSpacing', v);
  });

  $('readingFont').addEventListener('change', (e) => {
    writeSiteOverride('readingFont', e.target.value);
  });

  $('skipAppLike').addEventListener('change', (e) => {
    writeSiteOverride('skipAppLike', e.target.checked);
  });

  $('focusMode').addEventListener('change', (e) => {
    writeSiteOverride('focusMode', e.target.checked);
  });

  $('resetStats').addEventListener('click', async (e) => {
    // Button lives inside a <summary>; stop the click so it doesn't
    // toggle the details pane.
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Reset reading time?')) return;
    await chrome.runtime.sendMessage({ type: 'focusread-reset-analytics' });
    renderAnalytics();
  });

  $('reset').addEventListener('click', resetSite);

  $('openReader').disabled = !hostname;
  $('openReader').addEventListener('click', openInReader);

  // Remember which sections the user left expanded.
  for (const id of ['dyslexiaDetails', 'statsDetails']) {
    const el = $(id);
    const key = 'focusread-open:' + id;
    try {
      if (localStorage.getItem(key) === '1') el.open = true;
    } catch {}
    el.addEventListener('toggle', () => {
      try { localStorage.setItem(key, el.open ? '1' : '0'); } catch {}
    });
  }
}

async function openInReader() {
  const btn = $('openReader');
  btn.disabled = true;
  btn.textContent = 'Extracting…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    if (!/^https?:/.test(tab.url || '')) {
      throw new Error('Reader only works on http(s) pages, not ' + (tab.url || '').slice(0, 30));
    }
    // The content script may not be in this tab yet — it only auto-injects
    // into new navigations after the extension is installed/reloaded.
    // Try sendMessage; if it fails, inject on demand and retry.
    async function ask() {
      return chrome.tabs.sendMessage(tab.id, { type: 'extract-article' });
    }
    let resp;
    try {
      resp = await ask();
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: false },
          files: ['core.js', 'content.js']
        });
        resp = await ask();
      } catch (injErr) {
        throw new Error('Could not inject into this tab: ' + (injErr.message || injErr));
      }
    }
    if (!resp) throw new Error('No response from content script');
    if (!resp.ok || !resp.article) throw new Error(resp.error || 'Could not extract article');
    const id = String(Date.now());
    await chrome.storage.session.set({ ['article:' + id]: resp.article });
    const url = chrome.runtime.getURL('reader.html') + '?id=' + encodeURIComponent(id);
    await chrome.tabs.create({ url });
    window.close();
  } catch (e) {
    console.error('[ArcaRead] Open in Reader failed:', e);
    btn.textContent = e.message || 'Failed — try again';
    btn.title = e.message || '';
    setTimeout(() => {
      btn.textContent = 'Open this page in Reader';
      btn.title = '';
      btn.disabled = !hostname;
    }, 4500);
  }
}

init();
