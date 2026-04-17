# BionicRead

A minimal WebExtension (Manifest V3) that bolds the first half of each word on a page, a style of formatting sometimes called "bionic reading." Works in Chrome today; Safari packaging is planned.

## Features

- Bolds the first `ceil(n/2)` characters of each word
- Global on/off toggle (synced via `chrome.storage.sync`)
- Per-site toggle for the current domain
- Adjustable minimum word length (3–10, default 4)
- Adjustable font size threshold (10–20px, default 14) — smaller text is skipped
- MutationObserver picks up dynamically loaded content

## Load unpacked in Chrome

1. `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → select the `bionicread/` folder
4. Pin the extension, open the popup, tweak settings

## Project layout

```
manifest.json   # MV3 manifest
background.js   # service worker — seeds default settings
content.js     # DOM walker + MutationObserver
popup.html     # controls UI (dark, minimal)
popup.js       # popup logic → writes to chrome.storage.sync
```

## How it works

`content.js` walks all text nodes under `document.body`, wraps each in a `<span class="bionic-processed" data-bionic-original="...">`, and bolds the first half of every word meeting the minimum length. The `data-bionic-original` attribute stores the source text so toggling off cleanly restores the DOM.

Elements are skipped if:
- the tag is in the skip list (`SCRIPT`, `STYLE`, `CODE`, `PRE`, `INPUT`, `TEXTAREA`, etc.)
- the element is `contenteditable`
- the computed `font-size` is below the threshold
- the node is already inside a processed wrapper

A `MutationObserver` on `document.body` (`childList`, `subtree`, `characterData`) handles SPA navigation and lazy-loaded content.

## Safari

Not yet packaged. The plan is to run through `xcrun safari-web-extension-converter` once the Chrome build settles.

## Roadmap

- Icons
- Keyboard shortcut to toggle
- Smarter handling of mixed-script text
- Safari wrapper (`.xcodeproj`)
- Optional opacity adjustment for the non-bold half
