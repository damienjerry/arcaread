(() => {
  const DEFAULTS = {
    enabled: true,
    minWordLength: 4,
    fontSizeThreshold: 14,
    processIframes: true,
    siteOverrides: {}
  };

  const inTopFrame = window.top === window.self;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
    'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'TT',
    'SVG', 'MATH', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED'
  ]);
  const PROCESSED_CLASS = 'bionic-processed';
  const ORIGINAL_ATTR = 'data-bionic-original';

  let settings = { ...DEFAULTS };
  let observer = null;
  let active = false;

  function isEnabledForSite() {
    if (!settings.enabled) return false;
    if (!inTopFrame && !settings.processIframes) return false;
    const override = settings.siteOverrides?.[location.hostname];
    return override !== false;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function shouldProcessParent(el) {
    if (!el) return false;
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (el.isContentEditable) return false;
    if (el.closest(`[${ORIGINAL_ATTR}]`)) return false;
    if (el.closest('[contenteditable="true"]')) return false;
    const fontSize = parseFloat(getComputedStyle(el).fontSize);
    if (!isFinite(fontSize) || fontSize < settings.fontSizeThreshold) return false;
    return true;
  }

  function processTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || !shouldProcessParent(parent)) return;
    const text = node.nodeValue;
    if (!text || !text.trim()) return;

    const parts = text.split(/(\s+)/);
    let html = '';
    let modified = false;
    const min = settings.minWordLength;

    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        html += escapeHtml(part);
        continue;
      }
      const m = part.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}]+)([^\p{L}\p{N}]*)$/u);
      if (m && m[2].length >= min) {
        const [, pre, word, post] = m;
        const boldLen = Math.ceil(word.length / 2);
        html += escapeHtml(pre)
          + '<b>' + escapeHtml(word.slice(0, boldLen)) + '</b>'
          + escapeHtml(word.slice(boldLen))
          + escapeHtml(post);
        modified = true;
      } else {
        html += escapeHtml(part);
      }
    }

    if (!modified) return;

    const wrapper = document.createElement('span');
    wrapper.className = PROCESSED_CLASS;
    wrapper.setAttribute(ORIGINAL_ATTR, text);
    wrapper.innerHTML = html;
    parent.replaceChild(wrapper, node);
  }

  function collectTextNodes(root) {
    const out = [];
    if (!root) return out;
    if (root.nodeType === Node.TEXT_NODE) {
      out.push(root);
      return out;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return out;
    if (SKIP_TAGS.has(root.tagName)) return out;
    if (root.hasAttribute?.(ORIGINAL_ATTR)) return out;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest(`[${ORIGINAL_ATTR}]`)) return NodeFilter.FILTER_REJECT;
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function processSubtree(root) {
    const nodes = collectTextNodes(root);
    for (const n of nodes) processTextNode(n);
  }

  function undo() {
    const wrappers = document.querySelectorAll(`.${PROCESSED_CLASS}[${ORIGINAL_ATTR}]`);
    wrappers.forEach(w => {
      const original = w.getAttribute(ORIGINAL_ATTR);
      const parent = w.parentNode;
      if (parent && original !== null) {
        parent.replaceChild(document.createTextNode(original), w);
      }
    });
  }

  function activate() {
    if (active || !document.body) return;
    active = true;
    processSubtree(document.body);
    observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const added of m.addedNodes) {
            if (added.nodeType === Node.TEXT_NODE) {
              processTextNode(added);
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              if (added.classList?.contains(PROCESSED_CLASS)) continue;
              processSubtree(added);
            }
          }
        } else if (m.type === 'characterData') {
          if (m.target.parentElement?.closest(`[${ORIGINAL_ATTR}]`)) continue;
          processTextNode(m.target);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function deactivate() {
    if (observer) { observer.disconnect(); observer = null; }
    if (active) undo();
    active = false;
  }

  function apply() {
    if (isEnabledForSite()) {
      if (active) {
        deactivate();
        activate();
      } else {
        activate();
      }
    } else {
      deactivate();
    }
  }

  chrome.storage.sync.get(DEFAULTS, (data) => {
    settings = { ...DEFAULTS, ...data };
    if (document.body) {
      apply();
    } else {
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let touched = false;
    for (const key of Object.keys(changes)) {
      settings[key] = changes[key].newValue;
      touched = true;
    }
    if (touched) apply();
  });
})();
