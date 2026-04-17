# FocusRead

A WebExtension (Manifest V3) that bolds the first half of each word on a page so your eye can skim faster. Works on any webpage and ships with a PDF reader, a dyslexia toolkit, and an optional reading font.

## Features

- **Bionic bolding** with adjustable intensity (25–75%)
- **Smart content detection** — scopes the effect to the article body, skipping nav, footer, and ads
- **Per-site memory** — tune sliders for each domain; the settings stick
- **Font size filter** — skip tiny captions and giant banners (min / max in px)
- **Link-density filter** — skip blocks that are mostly hyperlinks (news feeds, tag clouds)
- **Dyslexia toolkit** — line-height, letter-spacing, and word-spacing sliders
- **Lexend reading font** — bundled, toggle on per-site
- **PDF reader** — renders PDFs through [PDF.js](https://mozilla.github.io/pdf.js/) with bionic applied
- **Keyboard shortcut** — `Cmd/Ctrl + Shift + F` toggles the current site

## Load unpacked in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Pin the extension from the puzzle-piece menu

## Project layout

```
core.js         # portable transformation — no DOM, no browser APIs
manifest.json   # MV3 manifest
background.js   # service worker — defaults, keyboard shortcut, PDF intercept
content.js      # DOM walker + MutationObserver (consumes core.js)
popup.html      # controls UI (dark, minimal)
popup.js        # popup logic → writes to chrome.storage.sync
viewer.html     # PDF reader page
viewer.js       # PDF.js glue, per-page text extraction, bionic render
vendor/         # PDF.js bundled build
fonts/          # Lexend variable font (SIL OFL)
icons/          # app icon in 16/32/48/128 + SVG source
```

`core.js` is deliberately dependency-free and UMD-exported so future shells (CLI, iOS reader, Android AccessibilityService, Electron desktop reader) can import the same transformation. It exposes `FocusCore.transform(text, { minWordLength, intensity })` returning structured `{ text, bold }` segments; the web shell renders those as `<b>` tags, but any platform can render them however it likes (NSAttributedString, SpannableString, ANSI bold, etc.).

## How it works

`content.js` walks text nodes under either the detected article root or the full document body, wraps each in a `<span class="focusread-processed" data-focusread-original="...">`, and bolds a prefix of every word meeting the minimum length. The `data-focusread-original` attribute stores the source text so toggling off cleanly restores the DOM.

Text is skipped if:
- the tag is in the skip list (`SCRIPT`, `STYLE`, `CODE`, `PRE`, `INPUT`, `TEXTAREA`, `NAV`, `ASIDE`, `FOOTER`, etc.)
- the element has an ARIA `role` of `navigation`, `complementary`, `banner`, `search`, `contentinfo`, `menu`, `menubar`, or `tablist`
- the element is `contenteditable`
- the computed `font-size` is below the minimum or above the maximum threshold
- the nearest block container has >60% link density
- the node is already inside a processed wrapper

A `MutationObserver` on the chosen root (`childList`, `subtree`, `characterData`) handles SPA navigation and lazy-loaded content.

## Safari

The extension is a standard Manifest V3 WebExtension and packages directly through Apple's converter. One-time Xcode setup if you haven't already:

```sh
sudo xcodebuild -runFirstLaunch
```

Then from the parent directory of this folder:

```sh
xcrun safari-web-extension-converter ./focusread \
  --project-location ./focusread/safari \
  --app-name "FocusRead" \
  --bundle-identifier "com.damienjerry.focusread" \
  --copy-resources --no-open --force
```

Open the generated `safari/FocusRead/FocusRead.xcodeproj` in Xcode, sign with your Apple ID team, build, and run. In Safari, enable **Develop → Allow unsigned extensions** or use your signed build, then flip the extension on under Settings → Extensions.

## Licenses

- FocusRead source: MIT (see root)
- Lexend font: SIL Open Font License (see `fonts/OFL.txt`)
- PDF.js: Apache 2.0 (Mozilla)
