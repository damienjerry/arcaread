// Welcome page wiring. Extracted from an inline <script> in welcome.html
// because Manifest V3's default content-security-policy blocks inline
// scripts in extension pages.

const SAMPLE =
  'Reading is practice, not magic. Bionic bolding anchors your eye to the front of each word so your brain fills in the rest.';

(function renderPreview() {
  try {
    const { segments } = FocusCore.transform(SAMPLE, { minWordLength: 4, intensity: 0.5 });
    document.getElementById('preview').innerHTML = FocusCore.toHtml(segments);
  } catch (e) {
    console.error('[Arcaread] preview render failed:', e);
  }
})();

// Render the ACTUAL bound shortcut. Chrome silently skips the manifest
// suggested_key if another extension already claimed it, so hard-coding
// a combo in the UI is a lie when the bind failed.
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

function renderKbd(label) {
  const span = document.createElement('span');
  span.className = 'kbd';
  span.textContent = label;
  return span;
}

function renderShortcut(parts) {
  const host = document.getElementById('shortcutLabel');
  if (!host) return;
  host.innerHTML = '';
  for (const p of parts) host.appendChild(renderKbd(p));
}

(async function initShortcut() {
  const labelEl = document.getElementById('shortcutLabel');
  const ctaEl = document.getElementById('shortcutCta');
  if (!labelEl || !ctaEl) return;
  try {
    const cmds = await chrome.commands.getAll();
    const toggle = cmds.find((c) => c.name === 'toggle-site');
    const shortcut = toggle?.shortcut || '';
    if (shortcut) {
      // Chrome returns combos like "⌘⇧A" or "Alt+Shift+A" depending on
      // platform. Split into chips; keep native glyphs where Chrome
      // already emits them.
      const parts = shortcut.includes('+') ? shortcut.split('+') : [...shortcut];
      renderShortcut(parts);
      ctaEl.textContent = 'Change →';
    } else {
      renderShortcut([isMac ? '⌥' : 'Alt', 'Shift', 'A']);
      labelEl.style.opacity = '0.45';
      ctaEl.textContent = 'No shortcut — assign one →';
    }
  } catch {
    renderShortcut([isMac ? '⌥' : 'Alt', 'Shift', 'A']);
  }
})();

// chrome:// URLs blocked in anchors — open via extension API
document.getElementById('openShortcuts')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  }
});

// External links from chrome-extension:// pages can get intercepted by
// ad blockers or navigation policies and mis-routed as downloads. Route
// through chrome.tabs.create which always opens in a normal tab.
function openExternal(e) {
  const url = e.currentTarget.getAttribute('href');
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    e.preventDefault();
    chrome.tabs.create({ url });
  }
}
document.getElementById('tryArticle')?.addEventListener('click', openExternal);
document.getElementById('sourceLink')?.addEventListener('click', openExternal);
