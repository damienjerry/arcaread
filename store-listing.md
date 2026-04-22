# Chrome Web Store listing copy

Copy these fields directly into the developer console at
https://chrome.google.com/webstore/devconsole.

---

## Publisher display name

**Option A:** `Damien Jerry`
**Option B:** `Arcana Reading` (if you register the business)

Pick one before you upload — you can change it later but it requires a re-verification.

---

## Store listing

### Extension name
```
ArcaRead
```

### Category
```
Accessibility
```
(Secondary option: *Productivity*. Accessibility fits better because of the dyslexia toolkit.)

### Short description (≤132 characters, shown in search results)
```
Read the web faster. Bionic bolding, clean reader view, on-device AI summaries, PDF support, dyslexia toolkit — free and private.
```
*(128 characters. Room to tweak.)*

### Detailed description (Markdown-ish, up to 16,000 characters)

```
ArcaRead helps you read the web faster by bolding the first half of each word — an effect sometimes called "bionic reading" — so your eye can skip ahead without losing your place.

It's more than just the bolding. ArcaRead ships a full reader toolkit:

━━━━━━━━━━━━━━━━━━━━━━━
WHAT YOU GET

• Bionic bolding on any webpage, with per-site adjustable intensity (25–75%) and minimum word length.

• Smart article detection — the effect is scoped to the actual article body. Nav, sidebars, footers and ads stay plain.

• Link-density filter — skips blocks that are mostly hyperlinks (news feeds, tag clouds).

• Per-site memory — sliders you tune for Medium remember their Medium settings; Wikipedia gets its own.

• Auto-skip on app-like pages — optional; ArcaRead stays quiet on Gmail, dashboards, and anything without a detectable article.

• Focus mode — dim every paragraph except the one you hover, to anchor your reading.

• Dyslexia toolkit — line-height, letter-spacing, word-spacing sliders plus an optional Lexend reading font.

• Reader view — click "Open this page in Reader" for a clean distilled article tab with five contrast tints (Paper / Sepia / Solarized / Dim / Night).

• Text-to-speech in Reader — hit Play for paragraph-by-paragraph audio with the speaking block highlighted.

• Phrase-chunking speed read — flash 1-4 word groups at 100-800 WPM, bionic still applied. Space plays, arrows step, Escape exits.

• PDF reader — flip one toggle and every PDF opens in ArcaRead's reader with bionic formatting.

• On-device AI summary — Chrome's built-in Gemini Nano generates a TL;DR for any article. Zero API cost, zero data leaving your device.

• Reading analytics — daily / all-time minutes read plus a words-per-minute estimate. Stored locally only, never synced.

• Keyboard shortcut — Cmd/Ctrl+Shift+F toggles ArcaRead for the current site.

━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY

ArcaRead doesn't ship any data off your device. Ever.

• Content scripts read text nodes to bold their prefixes. They do not transmit any of that text anywhere.

• Settings sync across your signed-in Chrome profiles via Chrome's standard sync. ArcaRead itself does not see or receive your settings.

• Reading-time and WPM stats live on this machine only, never synced.

• AI summaries use Chrome's on-device Gemini Nano. Article text is passed to Nano locally; nothing leaves your computer. If Nano isn't available, the button shows a clear "not available" message — there is no network fallback.

• ArcaRead makes no requests to any server operated by the author. No analytics SDK, no crash reporter, no telemetry.

Full source is open on GitHub: https://github.com/damienjerry/focusread

━━━━━━━━━━━━━━━━━━━━━━━
BROWSERS

Chrome, Edge, Brave, Arc, Opera: works unchanged.
Firefox: works with minor caveats.
Safari: packaged via Apple's web-extension converter (see README).

━━━━━━━━━━━━━━━━━━━━━━━
FREE

ArcaRead is free and open source (MIT licence) on all browsers. Native desktop and mobile reader apps are a separate paid product, released under a different repo.

Open source, privacy-respecting, and built by a human who reads a lot.
```

### Language
`English (United Kingdom)`
(or `English (United States)` if you prefer.)

### Tags / keywords (single words, store uses them for search)
```
reading, speed reading, bionic, reader, accessibility, dyslexia, focus, PDF, TTS, summarise, summary, article, lexend
```

---

## Images you still need to capture

Chrome Web Store required:

| Asset | Size | Required | Notes |
|---|---|---|---|
| Icon | 128×128 | ✓ yes | Already in `icons/icon-128.png` |
| Screenshots | 1280×800 or 640×400 | at least 1, up to 5 | See list below |
| Small promo tile | 440×280 | yes (prepped below) | `store-assets/promo-small.png` |
| Marquee promo | 1400×560 | optional but highly recommended for featured placement | `store-assets/promo-marquee.png` |

### Screenshot shot list (you take these — we auto-generate the rest)

Take 5 screenshots at **1280×800**:

1. **Popup over an article** — toolbar popup open on a Guardian / Wikipedia article showing the preview line at the top and sliders. Article visible behind with bionic bolding applied.
2. **Reader view** — clicked "Open this page in Reader", scrolled to the middle of an article with bionic applied.
3. **Chunks mode** — the RSVP overlay mid-play on a long article.
4. **Summarize result** — reader view with the on-device AI summary box visible above the article.
5. **Dyslexia toolkit** — popup with the Dyslexia section expanded, Lexend applied to the background page.

macOS quick screenshot at exactly 1280×800: use the built-in `Cmd+Shift+4`, drag a window, and resize the Chrome window to 1280×800 first via `window.resizeTo(1280, 800)` in the console.

---

## Privacy policy URL

Chrome requires a publicly accessible URL. We ship one in the repo at `privacy.html` and host it via GitHub Pages. The URL to paste into the developer console:

```
https://damienjerry.github.io/focusread/privacy.html
```

Enable GitHub Pages: repo → Settings → Pages → Source: `Deploy from a branch`, Branch: `main`, Folder: `/ (root)`, Save. Takes ~2 minutes.

---

## Permissions justifications

The developer console asks you to justify each permission. Copy these:

- **storage** — "Persists the user's per-site preferences (bionic intensity, font size filters, dyslexia toolkit settings) across sessions and Chrome-sync profiles."
- **activeTab** — "Sends an 'extract article' message to the current tab when the user clicks 'Open in Reader', and injects the content script on demand if the tab pre-dated the extension install."
- **scripting** — "On-demand re-injection of the content script into tabs that were open before the extension loaded, so 'Open in Reader' works without requiring the user to reload."
- **webNavigation** — "Detects navigations to .pdf URLs so the user's opt-in 'Open PDFs in reader' setting can redirect them to the bundled reader page."
- **host_permissions: <all_urls>** — "The bionic-reading effect is applied by walking text nodes on every page the user opens the extension on. No page content is ever transmitted off the device."

---

## Submission checklist (in order)

- [ ] Sign up at chrome.google.com/webstore/devconsole, pay $5, verify identity
- [ ] Download the latest `focusread-unpacked.zip` from GitHub Actions (Actions tab → latest green run → "Artifacts" → `focusread-unpacked`)
- [ ] Enable GitHub Pages for the repo (Settings → Pages)
- [ ] Upload zip on the developer console → "New item"
- [ ] Paste in the store listing fields above
- [ ] Upload 5 screenshots + the small promo tile from `store-assets/`
- [ ] Paste the privacy policy URL
- [ ] Paste the permissions justifications
- [ ] Submit for review (1-3 days typical)
- [ ] Once approved, grab the store URL and add it to the top of README.md
