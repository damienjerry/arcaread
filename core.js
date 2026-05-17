// Arcaread — portable core transformation.
// No DOM, no browser APIs, no dependencies. Safe to import from a content
// script, a Node CLI, a React Native shell, a Deno script, etc.
//
// Public surface:
//   FocusCore.transform(text, settings) -> { segments, modified }
//   FocusCore.toHtml(segments)          -> string (convenience for web)
//   FocusCore.boldPrefixLength(word, settings) -> number
//   FocusCore.tokenize(text)            -> token[]
//   FocusCore.DEFAULT_SETTINGS
//
// A "segment" is { text: string, bold: boolean }. Each platform shell
// renders segments in whatever form it wants (HTML <b>, NSAttributedString,
// Android SpannableString, ANSI bold in a terminal, etc.).

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.FocusCore = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    minWordLength: 4,
    intensity: 0.5
  });

  // Split text into whitespace runs and word-bearing chunks. Word-bearing
  // chunks are further decomposed into (leading punctuation, word, trailing
  // punctuation) using Unicode letter/number classes so non-ASCII text works.
  function tokenize(text) {
    const tokens = [];
    const parts = text.split(/(\s+)/);
    const wordRe = /^([^\p{L}\p{N}]*)([\p{L}\p{N}]+)([^\p{L}\p{N}]*)$/u;
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        tokens.push({ kind: 'space', text: part });
        continue;
      }
      const m = part.match(wordRe);
      if (m) {
        tokens.push({ kind: 'word', pre: m[1], word: m[2], post: m[3] });
      } else {
        tokens.push({ kind: 'raw', text: part });
      }
    }
    return tokens;
  }

  // How many leading characters of a word should be bolded. 0 = skip.
  function boldPrefixLength(word, settings) {
    const s = settings || DEFAULT_SETTINGS;
    const minLen = s.minWordLength ?? DEFAULT_SETTINGS.minWordLength;
    const intensity = s.intensity ?? DEFAULT_SETTINGS.intensity;
    if (word.length < minLen) return 0;
    const raw = Math.ceil(word.length * intensity);
    // Always leave at least one plain char so the bold is visibly a prefix.
    return Math.max(1, Math.min(word.length - 1, raw));
  }

  // Main transformation. Returns structured segments and a `modified` flag
  // so callers can skip DOM churn when nothing changed.
  function transform(text, settings) {
    const segments = [];
    const tokens = tokenize(text);
    let modified = false;
    for (const t of tokens) {
      if (t.kind !== 'word') {
        segments.push({ text: t.text, bold: false });
        continue;
      }
      const n = boldPrefixLength(t.word, settings);
      if (n > 0) {
        if (t.pre) segments.push({ text: t.pre, bold: false });
        segments.push({ text: t.word.slice(0, n), bold: true });
        segments.push({ text: t.word.slice(n), bold: false });
        if (t.post) segments.push({ text: t.post, bold: false });
        modified = true;
      } else {
        segments.push({ text: t.pre + t.word + t.post, bold: false });
      }
    }
    return { segments, modified };
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toHtml(segments) {
    let html = '';
    for (const s of segments) {
      if (s.bold) html += '<b>' + escapeHtml(s.text) + '</b>';
      else html += escapeHtml(s.text);
    }
    return html;
  }

  return {
    DEFAULT_SETTINGS,
    tokenize,
    boldPrefixLength,
    transform,
    toHtml,
    escapeHtml
  };
});
