(() => {
  const DEFAULTS = {
    enabled: true,
    minWordLength: 4,
    fontSizeThreshold: 14,
    processIframes: true,
    smartMode: true,
    siteOverrides: {}
  };

  const inTopFrame = window.top === window.self;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
    'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'TT',
    'SVG', 'MATH', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED',
    'NAV', 'ASIDE', 'FOOTER'
  ]);
  const SKIP_ROLES_SELECTOR =
    '[role="navigation"],[role="complementary"],[role="banner"],[role="search"],[role="contentinfo"],[role="menu"],[role="menubar"],[role="tablist"]';
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
    if (el.closest(SKIP_ROLES_SELECTOR)) return false;
    if (el.closest('nav, aside, footer')) return false;
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
        if (p.closest(SKIP_ROLES_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (p.closest('nav, aside, footer')) return NodeFilter.FILTER_REJECT;
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

  function wordCount(el) {
    const text = (el.textContent || '').trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
  }

  function linkDensity(el) {
    const textLen = (el.textContent || '').length;
    if (textLen === 0) return 1;
    let linkTextLen = 0;
    el.querySelectorAll('a').forEach(a => {
      linkTextLen += (a.textContent || '').length;
    });
    return linkTextLen / textLen;
  }

  // Heuristically identify the article root so we only bold real prose,
  // not nav, sidebars, ads, or footers. Returns null if nothing obvious —
  // caller falls back to processing the whole body (app-style pages).
  function findArticleRoot() {
    const MIN_WORDS = 150;
    const MAX_LINK_DENSITY = 0.4;

    // 1. <main> if it has substantial text
    const main = document.querySelector('main, [role="main"]');
    if (main && wordCount(main) >= MIN_WORDS && linkDensity(main) < MAX_LINK_DENSITY) {
      return main;
    }

    // 2. A single <article> (not a feed)
    const articles = document.querySelectorAll('article, [role="article"]');
    if (articles.length === 1) {
      const art = articles[0];
      if (wordCount(art) >= MIN_WORDS && linkDensity(art) < MAX_LINK_DENSITY) {
        return art;
      }
    }

    // 3. Common CMS/blog class names
    const classSelectors = [
      '.post-content', '.entry-content', '.article-content', '.article-body',
      '.post-body', '#article-body', '.story-body', '.markdown-body'
    ];
    for (const sel of classSelectors) {
      const el = document.querySelector(sel);
      if (el && wordCount(el) >= MIN_WORDS && linkDensity(el) < MAX_LINK_DENSITY) {
        return el;
      }
    }

    // 4. Density scoring fallback — pick the div/section with the highest
    //    text-to-link-and-chrome score.
    let best = null;
    let bestScore = 0;
    const candidates = document.querySelectorAll('div, section');
    for (const el of candidates) {
      const paragraphs = el.querySelectorAll('p');
      if (paragraphs.length < 4) continue;
      const words = wordCount(el);
      if (words < 250) continue;
      const density = linkDensity(el);
      if (density > 0.3) continue;
      // Prefer narrower containers: smaller DOM size for the same text = better.
      const domSize = el.getElementsByTagName('*').length || 1;
      const score = words / domSize + paragraphs.length * 2 - density * 10;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return best;
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

    // Smart mode: try to narrow to the article body. If nothing scores
    // (app-like pages, short pages, Gmail) we fall back to the full body.
    const detected = settings.smartMode ? findArticleRoot() : null;
    const root = detected || document.body;

    processSubtree(root);
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
    observer.observe(root, {
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
