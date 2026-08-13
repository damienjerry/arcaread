// Arcaread — URL scheme safety checks for the reader sanitiser.
// No DOM, no browser APIs, no dependencies, so it is unit-testable from Node
// in the same way core.js is.
//
// Public surface:
//   UrlSafety.normalizeUrlValue(value) -> string
//   UrlSafety.isUnsafeUrl(value)       -> boolean
//   UrlSafety.UNSAFE_SCHEMES           -> frozen string[]
//
// Why normalising matters: a URL's scheme is parsed only after the browser
// removes every tab/CR/LF from anywhere in the string and trims leading C0
// controls and spaces. Testing a raw attribute value therefore misses
// " javascript:alert(1)" and "java<TAB>script:alert(1)", both of which the
// browser happily executes. Worse, resolving such a value through new URL()
// performs exactly that normalisation, so an unnormalised check followed by
// an absolutize step can hand back the dangerous URL it just approved.

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.UrlSafety = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Schemes that can execute script or carry an inline document. Compared
  // against the normalised, lowercased value, so no /i flag is needed.
  const UNSAFE_SCHEMES = Object.freeze(['javascript:', 'data:']);

  // Mirror the URL parser: drop tab/LF/CR wherever they appear, trim leading
  // C0 controls and space, and lowercase so scheme comparison is exact.
  function normalizeUrlValue(value) {
    return String(value)
      .replace(/[\t\n\r]/g, '')
      .replace(/^[\x00-\x20]+/, '')
      .toLowerCase();
  }

  function isUnsafeUrl(value) {
    if (value === null || value === undefined) return false;
    const normalized = normalizeUrlValue(value);
    for (const scheme of UNSAFE_SCHEMES) {
      if (normalized.startsWith(scheme)) return true;
    }
    return false;
  }

  return {
    UNSAFE_SCHEMES,
    normalizeUrlValue,
    isUnsafeUrl
  };
});
