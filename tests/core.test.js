// Unit tests for the portable transformation core. Run with `node --test`.
// core.js is UMD-exported, so Node picks up its CommonJS registration.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const FocusCore = require('../core.js');

test('exposes the documented public surface', () => {
  assert.equal(typeof FocusCore.transform, 'function');
  assert.equal(typeof FocusCore.toHtml, 'function');
  assert.equal(typeof FocusCore.boldPrefixLength, 'function');
  assert.equal(typeof FocusCore.tokenize, 'function');
  assert.equal(typeof FocusCore.escapeHtml, 'function');
  assert.ok(FocusCore.DEFAULT_SETTINGS);
});

test('DEFAULT_SETTINGS is frozen so mutation can\'t leak between callers', () => {
  assert.ok(Object.isFrozen(FocusCore.DEFAULT_SETTINGS));
});

test('boldPrefixLength returns 0 for words under the minimum length', () => {
  assert.equal(FocusCore.boldPrefixLength('hi', { minWordLength: 4, intensity: 0.5 }), 0);
  assert.equal(FocusCore.boldPrefixLength('cat', { minWordLength: 4, intensity: 0.5 }), 0);
});

test('boldPrefixLength leaves at least one plain trailing char', () => {
  // intensity=1 would bold the whole word, but we clamp to n-1.
  assert.equal(FocusCore.boldPrefixLength('test', { minWordLength: 3, intensity: 1 }), 3);
  assert.equal(FocusCore.boldPrefixLength('a', { minWordLength: 1, intensity: 1 }), 1);
});

test('boldPrefixLength scales with intensity', () => {
  const word = 'abcdefgh'; // 8 chars
  assert.equal(FocusCore.boldPrefixLength(word, { minWordLength: 3, intensity: 0.25 }), 2);
  assert.equal(FocusCore.boldPrefixLength(word, { minWordLength: 3, intensity: 0.50 }), 4);
  assert.equal(FocusCore.boldPrefixLength(word, { minWordLength: 3, intensity: 0.75 }), 6);
});

test('tokenize preserves spaces between words', () => {
  const toks = FocusCore.tokenize('a b');
  assert.equal(toks.length, 3);
  assert.equal(toks[0].kind, 'word');
  assert.equal(toks[1].kind, 'space');
  assert.equal(toks[2].kind, 'word');
});

test('tokenize splits leading and trailing punctuation from a word', () => {
  const [tok] = FocusCore.tokenize('"hello!"');
  assert.equal(tok.kind, 'word');
  assert.equal(tok.pre, '"');
  assert.equal(tok.word, 'hello');
  assert.equal(tok.post, '!"');
});

test('tokenize handles Unicode letters (no ASCII-only bug)', () => {
  const toks = FocusCore.tokenize('café naïve Björk 日本語');
  // Four word tokens separated by three space tokens.
  const words = toks.filter(t => t.kind === 'word');
  assert.equal(words.length, 4);
  assert.equal(words[0].word, 'café');
  assert.equal(words[3].word, '日本語');
});

test('transform returns modified=false when no word clears the minimum length', () => {
  const r = FocusCore.transform('hi a 3', { minWordLength: 4, intensity: 0.5 });
  assert.equal(r.modified, false);
  // No segment is bold.
  assert.ok(r.segments.every(s => !s.bold));
  // Segments round-trip to the original text.
  assert.equal(r.segments.map(s => s.text).join(''), 'hi a 3');
});

test('transform bolds eligible words and keeps the tails plain', () => {
  const r = FocusCore.transform('hello', { minWordLength: 4, intensity: 0.5 });
  assert.equal(r.modified, true);
  // ceil(5 * 0.5) = 3
  assert.deepEqual(r.segments, [
    { text: 'hel', bold: true },
    { text: 'lo', bold: false }
  ]);
});

test('transform preserves leading / trailing punctuation', () => {
  const r = FocusCore.transform('"wonderful!"', { minWordLength: 4, intensity: 0.5 });
  // ceil(9 * 0.5) = 5
  const bolded = r.segments.find(s => s.bold);
  assert.equal(bolded.text, 'wonde');
  assert.equal(r.segments[0].text, '"');
  assert.equal(r.segments.at(-1).text, '!"');
});

test('transform is idempotent in output for the same input', () => {
  const a = FocusCore.transform('Testing idempotent transform', { minWordLength: 4, intensity: 0.5 });
  const b = FocusCore.transform('Testing idempotent transform', { minWordLength: 4, intensity: 0.5 });
  assert.deepEqual(a, b);
});

test('toHtml emits <b> for bold segments and escapes unsafe chars', () => {
  const html = FocusCore.toHtml([
    { text: '<foo', bold: true },
    { text: ' & >bar', bold: false }
  ]);
  assert.equal(html, '<b>&lt;foo</b> &amp; &gt;bar');
});

test('escapeHtml handles ampersands, lt, gt only (not quotes)', () => {
  assert.equal(FocusCore.escapeHtml('a & b < c > d " e'), 'a &amp; b &lt; c &gt; d " e');
});

test('end-to-end: transform + toHtml gives expected HTML for a full sentence', () => {
  const { segments } = FocusCore.transform(
    'Reading is practice, not magic.',
    { minWordLength: 4, intensity: 0.5 }
  );
  const html = FocusCore.toHtml(segments);
  // Every eligible word (>= 4 chars) should have a <b> prefix.
  assert.match(html, /<b>Read<\/b>ing/);
  assert.match(html, /<b>prac<\/b>tice/);
  // 'magic' has 5 chars, intensity 0.5 → ceil(5*0.5) = 3 bold chars.
  assert.match(html, /<b>mag<\/b>ic/);
  // Short words stay plain (3-char 'not' is under the 4-char min).
  assert.doesNotMatch(html, /<b>is<\/b>/);
  assert.doesNotMatch(html, /<b>not<\/b>/);
});
