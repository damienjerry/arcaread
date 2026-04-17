(() => {
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
    siteSettings: {}
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
  const PROCESSED_CLASS = 'focusread-processed';
  const ORIGINAL_ATTR = 'data-focusread-original';

  let settings = { ...DEFAULTS };
  let effective = { ...DEFAULTS };
  let observer = null;
  let active = false;

  // Merge global defaults with per-site overrides for the current hostname.
  // Any field in siteSettings[host] wins over the global value for that host.
  function computeEffective() {
    const host = location.hostname;
    const site = (settings.siteSettings && settings.siteSettings[host]) || {};
    return {
      enabled: settings.enabled && site.enabled !== false,
      processIframes: site.processIframes ?? settings.processIframes,
      minWordLength: site.minWordLength ?? settings.minWordLength,
      fontSizeThreshold: site.fontSizeThreshold ?? settings.fontSizeThreshold,
      fontSizeMax: site.fontSizeMax ?? settings.fontSizeMax,
      intensity: site.intensity ?? settings.intensity,
      smartMode: site.smartMode ?? settings.smartMode,
      dyslexiaMode: site.dyslexiaMode ?? settings.dyslexiaMode,
      lineHeight: site.lineHeight ?? settings.lineHeight,
      letterSpacing: site.letterSpacing ?? settings.letterSpacing,
      wordSpacing: site.wordSpacing ?? settings.wordSpacing,
      readingFont: site.readingFont ?? settings.readingFont,
      skipAppLike: site.skipAppLike ?? settings.skipAppLike,
      focusMode: site.focusMode ?? settings.focusMode
    };
  }

  function isEnabledHere() {
    if (!effective.enabled) return false;
    if (!inTopFrame && !effective.processIframes) return false;
    return true;
  }

  // Per-block link density cache. For a given block-level container
  // (paragraph, list item, etc.) the fraction of its text that lives
  // inside <a> tags. High values mean "this block is mostly links" —
  // feeds, tag clouds, "In the news" bullets — which should be skipped.
  const BLOCK_SELECTOR = 'p, li, blockquote, dd, dt, figcaption, h1, h2, h3, h4, h5, h6';
  const BLOCK_LINK_DENSITY_MAX = 0.6;
  const densityCache = new WeakMap();
  function blockDensity(el) {
    if (densityCache.has(el)) return densityCache.get(el);
    const d = linkDensity(el);
    densityCache.set(el, d);
    return d;
  }

  function shouldProcessParent(el) {
    if (!el) return false;
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (el.isContentEditable) return false;
    if (el.closest(`[${ORIGINAL_ATTR}]`)) return false;
    if (el.closest('[contenteditable="true"]')) return false;
    if (el.closest(SKIP_ROLES_SELECTOR)) return false;
    if (el.closest('nav, aside, footer')) return false;
    const block = el.closest(BLOCK_SELECTOR);
    if (block && blockDensity(block) > BLOCK_LINK_DENSITY_MAX) return false;
    const fontSize = parseFloat(getComputedStyle(el).fontSize);
    if (!isFinite(fontSize)) return false;
    if (fontSize < effective.fontSizeThreshold) return false;
    if (fontSize > effective.fontSizeMax) return false;
    return true;
  }

  function processTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || !shouldProcessParent(parent)) return;
    const text = node.nodeValue;
    if (!text || !text.trim()) return;

    const { segments, modified } = FocusCore.transform(text, {
      minWordLength: effective.minWordLength,
      intensity: effective.intensity
    });
    if (!modified) return;

    const wrapper = document.createElement('span');
    wrapper.className = PROCESSED_CLASS;
    wrapper.setAttribute(ORIGINAL_ATTR, text);
    wrapper.innerHTML = FocusCore.toHtml(segments);
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

    const main = document.querySelector('main, [role="main"]');
    if (main && wordCount(main) >= MIN_WORDS && linkDensity(main) < MAX_LINK_DENSITY) {
      return main;
    }

    const articles = document.querySelectorAll('article, [role="article"]');
    if (articles.length === 1) {
      const art = articles[0];
      if (wordCount(art) >= MIN_WORDS && linkDensity(art) < MAX_LINK_DENSITY) {
        return art;
      }
    }

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
      const domSize = el.getElementsByTagName('*').length || 1;
      const score = words / domSize + paragraphs.length * 2 - density * 10;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return best;
  }

  const DYSLEXIA_STYLE_ID = 'focusread-style';

  // Combined style injector for dyslexia spacing + reading font +
  // focus mode. Uses a low-specificity rule on <html> so values
  // inherit through prose but component-level CSS (buttons, code
  // blocks) still wins and site UIs don't break.
  function applyReadingStyles() {
    const existing = document.getElementById(DYSLEXIA_STYLE_ID);
    const rules = [];
    const declarations = [];

    if (effective.readingFont === 'lexend') {
      const fontUrl = chrome.runtime.getURL('fonts/Lexend-Variable.ttf');
      rules.push(
        `@font-face { font-family: 'FocusRead-Lexend'; src: url("${fontUrl}") format('truetype-variations'); font-weight: 100 900; font-display: swap; }`
      );
      declarations.push(`font-family: 'FocusRead-Lexend', system-ui, sans-serif !important`);
    }
    if (effective.dyslexiaMode) {
      declarations.push(`line-height: ${effective.lineHeight} !important`);
      declarations.push(`letter-spacing: ${effective.letterSpacing}em !important`);
      declarations.push(`word-spacing: ${effective.wordSpacing}em !important`);
    }

    if (declarations.length > 0) {
      rules.push(`html { ${declarations.join('; ')}; }`);
    }

    // Focus mode: dim every paragraph/list-item and restore the one
    // the cursor is over. Hover transitions give a gentle reveal.
    if (effective.focusMode) {
      rules.push(
        `html.focusread-focus p, html.focusread-focus li, html.focusread-focus blockquote, html.focusread-focus dd { transition: opacity 0.25s ease; opacity: 0.35; }`,
        `html.focusread-focus p:hover, html.focusread-focus li:hover, html.focusread-focus blockquote:hover, html.focusread-focus dd:hover { opacity: 1; }`
      );
    }

    if (rules.length === 0) {
      document.documentElement.classList.remove('focusread-focus');
      if (existing) existing.remove();
      return;
    }

    document.documentElement.classList.toggle('focusread-focus', !!effective.focusMode);

    const css = rules.join('\n');
    const el = existing || document.createElement('style');
    el.id = DYSLEXIA_STYLE_ID;
    el.textContent = css;
    if (!existing) {
      (document.head || document.documentElement).appendChild(el);
    }
  }

  function removeReadingStyles() {
    document.documentElement?.classList.remove('focusread-focus');
    const el = document.getElementById(DYSLEXIA_STYLE_ID);
    if (el) el.remove();
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

    const detected = effective.smartMode ? findArticleRoot() : null;
    // Auto-skip on app-like pages: smart mode on, skipAppLike on, no
    // article detected → do nothing. Users can still force processing
    // by turning smart mode off for this site.
    if (effective.smartMode && effective.skipAppLike && !detected) {
      return;
    }
    active = true;
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
    removeReadingStyles();
    active = false;
  }

  function apply() {
    effective = computeEffective();
    if (isEnabledHere()) {
      applyReadingStyles();
      if (active) {
        // Settings changed — tear down word wrappers and redo with new
        // effective values; keep the dyslexia sheet intact via the
        // applyDyslexiaStyles call above.
        if (observer) { observer.disconnect(); observer = null; }
        undo();
        active = false;
        activate();
      } else {
        activate();
      }
    } else {
      deactivate();
    }
  }

  // One-time migration: move legacy siteOverrides { host: bool } into
  // siteSettings[host].enabled and drop siteOverrides.
  function migrateLegacyIfNeeded(data) {
    if (!data.siteOverrides) return data;
    const siteSettings = { ...(data.siteSettings || {}) };
    for (const [host, enabled] of Object.entries(data.siteOverrides)) {
      siteSettings[host] = { ...(siteSettings[host] || {}), enabled };
    }
    chrome.storage.sync.set({ siteSettings });
    chrome.storage.sync.remove('siteOverrides');
    return { ...data, siteSettings, siteOverrides: undefined };
  }

  // Reading time telemetry. Ticks every TICK_SECONDS while:
  //   - this frame is the top frame (don't double-count iframes)
  //   - the document is visible
  //   - the extension is active on this page
  // Background aggregates into chrome.storage.local.
  const TICK_SECONDS = 15;
  let tickHandle = null;
  function startTicking() {
    stopTicking();
    if (!inTopFrame) return;
    tickHandle = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!active) return;
      try {
        chrome.runtime.sendMessage({
          type: 'focusread-tick',
          seconds: TICK_SECONDS,
          host: location.hostname
        });
      } catch {}
    }, TICK_SECONDS * 1000);
  }
  function stopTicking() {
    if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; }
  }

  chrome.storage.sync.get(null, (raw) => {
    const data = migrateLegacyIfNeeded(raw);
    settings = { ...DEFAULTS, ...data };
    if (document.body) {
      apply();
    } else {
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    }
    startTicking();
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
