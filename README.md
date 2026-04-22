# ArcaRead

Read the web faster. ArcaRead is a Manifest V3 browser extension that applies *bionic reading* — bolding the first half of each word — to any webpage, plus ships a full Reader view with on-device AI summaries, a dyslexia toolkit, and a PDF viewer.

Free and open source on browsers. Native desktop / mobile apps are a separate (paid) product.

---

## Table of contents

- [What you get](#what-you-get)
- [Install](#install)
- [Usage](#usage)
- [Privacy](#privacy)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Develop locally](#develop-locally)
- [Safari packaging](#safari-packaging)
- [Roadmap](#roadmap)
- [License](#license)

---

## What you get

- **Bionic bolding** on any page, with per-site adjustable intensity (25–75%) and minimum word length
- **Smart article detection** — the effect is scoped to the actual article body so nav, sidebar, footer, and ads stay plain
- **Link-density filter** — skips blocks that are mostly hyperlinks (news feeds, tag clouds)
- **Per-site memory** — sliders tuned for Medium remember Medium settings; Wikipedia gets its own
- **Auto-skip on app-like pages** — optional; ArcaRead stays quiet on Gmail, dashboards, and anything without a detectable article
- **Focus mode** — dim every paragraph except the one you hover
- **Dyslexia toolkit** — line-height, letter-spacing, word-spacing sliders + optional Lexend reading font
- **Reader view** — clean distilled article tab with TTS playback, phrase-chunking speed-read mode, and five contrast tints (Paper / Sepia / Solarized / Dim / Night)
- **PDF reader** — rendered through PDF.js with bionic applied, same toolbar
- **On-device AI summary** — Chrome's built-in Gemini Nano generates a TL;DR for any article. Zero API cost, zero data leaving the device
- **Reading analytics** — daily / all-time minutes read + WPM estimate, stored locally only
- **Keyboard shortcut** — `Cmd/Ctrl + Shift + F` toggles the current site

---

## Install

### Chrome / Edge / Brave / Arc / Opera

1. Clone this repo or download as a zip.
2. Open `chrome://extensions` (`edge://extensions`, `brave://extensions`, etc.).
3. Toggle **Developer mode**.
4. Click **Load unpacked** and select the repo folder.
5. Pin the extension from the puzzle-piece menu.

A Chrome Web Store listing is on the roadmap; until then, unpacked install is the route.

### Firefox

MV3 landed in Firefox 121+. ArcaRead targets the Chromium API surface; Firefox works with minor caveats (service worker semantics differ slightly). Same `about:debugging` → "Load Temporary Add-on" flow. A `web-ext` build and AMO submission is planned.

### Safari

See [Safari packaging](#safari-packaging) below — one `xcrun` invocation produces an Xcode project.

---

## Usage

- Click the toolbar icon to open the popup. Everything you need is there.
- The preview at the top shows the current effect live as you drag the sliders.
- **Open this page in Reader** distills the article into a dedicated reader tab.
- In Reader: hit **▶** for TTS, **Chunks** for a speed-read (RSVP) overlay, **Summarize** for a Nano-generated TL;DR, and the tint dropdown for palette.
- Keyboard shortcut: `Cmd+Shift+F` (or `Ctrl+Shift+F`) toggles ArcaRead for the current site.

---

## Privacy

ArcaRead does not ship any data off your device. Ever. Specifically:

- **Content scripts.** Yes, ArcaRead runs a script on every page you visit — that's how bionic bolding works. It reads text nodes to bold their prefixes. It does not transmit any of that text.
- **Settings.** Sliders and per-site overrides are stored in `chrome.storage.sync` so they follow you across signed-in Chrome profiles, via Google's standard sync. ArcaRead does not see or receive any of that data.
- **Analytics.** The reading-time and WPM stats live in `chrome.storage.local` on this machine only — never synced, never sent anywhere.
- **AI summaries.** The Summarize button uses Chrome's on-device Gemini Nano. Article text is passed to Nano locally; nothing leaves your computer. If Nano isn't available (Safari, Firefox, older Chrome), the button shows a clear "not available" message — there is no network fallback.
- **PDF reader.** When you opt into "Open PDFs in reader", ArcaRead fetches the PDF bytes from its original URL and renders them locally via PDF.js. No third party sees the fetch.
- **Network.** The extension makes no requests to any server operated by the author. No analytics SDK, no crash reporter, no telemetry.

If you're still uncertain: the full source is right here. `content.js` is the only file that touches page content. `grep "fetch\|XMLHttpRequest\|sendBeacon"` shows every network call — you'll find only the PDFs you explicitly asked to open.

---

## How it works

### Bionic transformation

`core.js` is a ~60-line dependency-free module exposing `FocusCore.transform(text, settings)` which returns `{ segments, modified }` where each segment is `{ text, bold }`. It handles Unicode letters, punctuation, and the minimum-word-length / intensity settings. It is UMD-exported (CommonJS + global), so the exact same code runs in the content script, in Node (tests), and later in a JavaScriptCore bridge for iOS / macOS.

### Content-script walk

`content.js` walks text nodes under either a detected article root (if smart mode is on and an article exists) or the full `document.body`. Each text node is replaced with a `<span class="focusread-processed" data-focusread-original="...">` containing the transformed HTML. The `data-focusread-original` attribute preserves the source text so toggling off cleanly restores the DOM.

Skip rules:
- Tags in the skip list (`SCRIPT`, `STYLE`, `CODE`, `PRE`, `INPUT`, `TEXTAREA`, `NAV`, `ASIDE`, `FOOTER`, SVG, canvas, etc.)
- ARIA roles (`navigation`, `complementary`, `banner`, `search`, `contentinfo`, `menu`, `menubar`, `tablist`)
- `contenteditable` elements
- Font size below the minimum or above the maximum threshold
- Blocks where >60% of text is inside `<a>` tags (news feeds, tag clouds)

A `MutationObserver` on the chosen root handles SPA navigation and lazy-loaded content. Open shadow roots are traversed explicitly at initial load and when new shadow-hosting elements are added.

### Settings model

Two tiers, merged at read time:

- **Global defaults** (stored in `chrome.storage.sync`) — base values that apply to every site.
- **Per-site overrides** (`siteSettings[hostname]`) — any subset of keys overrides the global for that hostname.

Changing a slider in the popup always writes to the current site's overrides, never to the global. A "Reset" button wipes the overrides for this site. A small indicator dot lights up when overrides exist.

### Reader view

When the user clicks **Open this page in Reader**, the content script clones the detected article root, strips unsafe tags (`<script>`, `<iframe>`, `<object>`, `<embed>`), absolutizes relative URLs, and hands the sanitized HTML to the popup. The popup stashes it in `chrome.storage.session` and opens `reader.html?id=<key>`. The reader page reads the stashed payload, renders it with `FocusCore.transform` applied, and exposes TTS, chunks, tints, and summarize.

### PDF reader

`vendor/pdf.min.js` + `pdf.worker.min.js` are the stock Mozilla PDF.js build. When **Open PDFs in reader** is enabled, the background service worker intercepts navigations to `*.pdf` URLs and redirects them to `viewer.html?file=<url>`. The viewer fetches the PDF, extracts text with PDF.js, groups items into paragraphs by vertical gap, and renders each paragraph with bionic applied.

---

## Project layout

```
core.js                # portable transformation — no DOM, no browser APIs
manifest.json          # MV3 manifest
background.js          # service worker — defaults, keyboard shortcut,
                       # PDF intercept, analytics aggregator, welcome trigger
content.js             # DOM walker + MutationObserver (consumes core.js)
popup.html, popup.js   # toolbar popup — settings UI, Open in Reader button
reader.html, reader.js # clean reader view — TTS, chunks, tints, summarize
viewer.html, viewer.js # PDF reader — wraps PDF.js with bionic rendering
welcome.html           # first-run tour
fonts/                 # Lexend variable font + SIL OFL licence
vendor/                # PDF.js bundled build
icons/                 # app icon 16/32/48/128 + SVG source + design explorations
tests/                 # unit tests for core.js (node --test)
.github/workflows/     # CI: tests, syntax, zip artifact
```

---

## Develop locally

```sh
# Run the unit tests
node --test tests/

# Syntax-check all extension JS
for f in core.js content.js background.js popup.js reader.js viewer.js; do
  node --check "$f"
done

# Validate the manifest
python3 -m json.tool < manifest.json > /dev/null
```

Changes to extension files are picked up by clicking the reload button on the ArcaRead card at `chrome://extensions`. Changes to content scripts also require reloading any open tabs you want to test on — Chrome does not retroactively inject into open tabs.

CI runs the same three checks on every push and builds a downloadable zip artifact on the Actions tab for handing to testers.

---

## Safari packaging

The extension is a standard MV3 WebExtension and packages through Apple's converter. One-time Xcode setup if you haven't already:

```sh
sudo xcodebuild -runFirstLaunch
```

Then from the repo parent directory:

```sh
xcrun safari-web-extension-converter ./focusread \
  --project-location ./focusread/safari \
  --app-name "ArcaRead" \
  --bundle-identifier "com.damienjerry.focusread" \
  --copy-resources --no-open --force
```

Open the generated `safari/ArcaRead/ArcaRead.xcodeproj` in Xcode, sign with your Apple ID team, build, and run. In Safari, enable **Develop → Allow unsigned extensions** or use your signed build, then flip it on under Settings → Extensions.

---

## Roadmap

- Chrome Web Store / Edge Add-ons / Firefox AMO / Safari App Store listings
- Shadow-DOM mutation observers (catch changes inside existing shadow roots, not just on initial load)
- Native iOS app with Share Sheet integration — *paid, separate repo*
- Native macOS / Windows / Linux readers — *paid, separate repo*
- Optional `en` / `es` / `ja` summariser output (currently English only)
- BYOK AI (OpenAI / Anthropic) as a power-user alternative to Gemini Nano

---

## License

ArcaRead source: **MIT** — see [LICENSE](LICENSE).
Lexend font (bundled under `fonts/`): **SIL Open Font License 1.1** — see `fonts/OFL.txt`.
PDF.js (bundled under `vendor/`): **Apache 2.0**.
