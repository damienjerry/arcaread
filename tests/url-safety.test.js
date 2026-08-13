// Unit tests for the reader sanitiser's URL scheme checks. Run with
// `node --test`. url-safety.js is UMD-exported, so Node picks up its
// CommonJS registration the same way core.js does.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const UrlSafety = require('../url-safety.js');

// Built from char codes so the control characters survive copy/paste and
// stay visible in a diff.
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const NUL = String.fromCharCode(0);

test('exposes the documented public surface', () => {
  assert.equal(typeof UrlSafety.isUnsafeUrl, 'function');
  assert.equal(typeof UrlSafety.normalizeUrlValue, 'function');
  assert.ok(Array.isArray(UrlSafety.UNSAFE_SCHEMES));
  assert.ok(Object.isFrozen(UrlSafety.UNSAFE_SCHEMES));
});

test('blocks the plain dangerous schemes', () => {
  assert.equal(UrlSafety.isUnsafeUrl('javascript:alert(1)'), true);
  assert.equal(UrlSafety.isUnsafeUrl('data:text/html,payload'), true);
});

test('is case-insensitive', () => {
  assert.equal(UrlSafety.isUnsafeUrl('JAVASCRIPT:alert(1)'), true);
  assert.equal(UrlSafety.isUnsafeUrl('JaVaScRiPt:alert(1)'), true);
  assert.equal(UrlSafety.isUnsafeUrl('DATA:text/html,payload'), true);
});

// The regression this file exists for. A scheme is parsed only after the
// browser trims leading C0 controls/spaces and strips every tab/CR/LF from
// anywhere in the string, so each of these executes despite not starting
// with a literal "javascript:".
test('blocks schemes hidden behind leading whitespace and control chars', () => {
  const vectors = [
    ' javascript:alert(1)',
    '  javascript:alert(1)',
    TAB + 'javascript:alert(1)',
    LF + 'javascript:alert(1)',
    CR + 'javascript:alert(1)',
    NUL + 'javascript:alert(1)',
    ' data:text/html,payload'
  ];
  for (const v of vectors) {
    assert.equal(UrlSafety.isUnsafeUrl(v), true, 'should block: ' + JSON.stringify(v));
  }
});

test('blocks schemes split by embedded tab/newline/CR', () => {
  const vectors = [
    'java' + TAB + 'script:alert(1)',
    'java' + LF + 'script:alert(1)',
    'java' + CR + 'script:alert(1)',
    'j' + TAB + 'a' + LF + 'v' + CR + 'a' + TAB + 'script:alert(1)',
    'da' + TAB + 'ta:text/html,payload',
    '  JaVa' + TAB + 'ScRiPt:alert(1)'
  ];
  for (const v of vectors) {
    assert.equal(UrlSafety.isUnsafeUrl(v), true, 'should block: ' + JSON.stringify(v));
  }
});

test('allows ordinary URLs', () => {
  const vectors = [
    '/foo/bar',
    'other.html',
    'https://example.com/x',
    'http://example.com/x',
    '//cdn.example.com/a.png',
    '#section',
    '?a=1',
    'mailto:someone@example.com',
    'tel:+441234567890',
    ''
  ];
  for (const v of vectors) {
    assert.equal(UrlSafety.isUnsafeUrl(v), false, 'should allow: ' + JSON.stringify(v));
  }
});

// A path or query may legitimately contain the text "javascript:" without the
// URL using that scheme. Blocking those would silently break real links.
test('does not block URLs that merely contain a scheme name later on', () => {
  const vectors = [
    '/blog/javascript:-the-good-parts',
    'https://example.com/search?q=javascript:alert',
    'https://example.com/search?q=data:image',
    '/notes#data:uris'
  ];
  for (const v of vectors) {
    assert.equal(UrlSafety.isUnsafeUrl(v), false, 'should allow: ' + JSON.stringify(v));
  }
});

test('handles null and undefined without throwing', () => {
  assert.equal(UrlSafety.isUnsafeUrl(null), false);
  assert.equal(UrlSafety.isUnsafeUrl(undefined), false);
});

test('normalizeUrlValue strips the characters the URL parser ignores', () => {
  assert.equal(UrlSafety.normalizeUrlValue(' javascript:x'), 'javascript:x');
  assert.equal(UrlSafety.normalizeUrlValue('java' + TAB + 'script:x'), 'javascript:x');
  assert.equal(UrlSafety.normalizeUrlValue('JAVASCRIPT:X'), 'javascript:x');
  // Trailing whitespace is not load-bearing for scheme detection, so it is
  // left alone rather than trimmed.
  assert.equal(UrlSafety.normalizeUrlValue('/path'), '/path');
});

// The original bug was not the check alone but the check followed by
// new URL(), which performs the same normalisation and so rebuilt a working
// javascript: URL from a value the check had approved. Guard both ends.
test('resolved URLs are still caught after new URL() normalisation', () => {
  const base = 'https://example.com/dir/article';
  const vectors = [
    ' javascript:alert(1)',
    'java' + TAB + 'script:alert(1)',
    LF + 'javascript:alert(1)',
    ' data:text/html,payload'
  ];
  for (const raw of vectors) {
    const resolved = new URL(raw, base).href;
    assert.equal(
      UrlSafety.isUnsafeUrl(resolved),
      true,
      'resolved form should still be blocked: ' + JSON.stringify(raw) + ' -> ' + resolved
    );
  }
});

test('ordinary URLs survive absolutizing unchanged', () => {
  const base = 'https://example.com/dir/article';
  const resolved = new URL('/foo/bar', base).href;
  assert.equal(UrlSafety.isUnsafeUrl(resolved), false);
  assert.equal(resolved, 'https://example.com/foo/bar');
});
