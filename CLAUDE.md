# ArcaRead — Bionic-reading browser extension

<!-- ───── Orchestrator ──────────────────────────────────────────
  Scope: personal · Status: shipping (submitted Chrome Web Store, pending approval 2026-04-23)
  Criticality: med
  Repo: github.com/damienjerry/arcaread (public)
  Manifest: manifest.json (MV3)
  Deploy target: chrome-web-store
  Related: focusread/focusreados (native, paid) — vendors core.js from this repo
  Secrets: op://Personal/focusread
  Tracked in: ~/Code/orchestrator/inventory/businesses.yaml (id: focusread.arcaread)
─────────────────────────────────────────────────────────────── -->

## What it is

Manifest V3 Chrome/Safari web extension. Applies bionic-reading to any page (bolds first half of each word). Ships Reader view with on-device AI summaries, dyslexia toolkit, PDF viewer.

## Stack

- Vanilla JS (`content.js`, `background.js`, `core.js`, `popup.html`)
- Manifest V3
- No build step — raw files load directly

## Key files

- `manifest.json` — extension manifest
- `content.js` — page injection / bionic transform
- `background.js` — service worker
- `core.js` — **shared with `focusreados` repo** (closed-source native apps vendor this)
- `popup.html` — extension popup UI

## Release

Chrome Web Store submission pending review. Bump version in `manifest.json`, zip root, upload via developer dashboard.

## Don't

- Don't introduce a build step without updating `focusreados` too — they vendor `core.js` raw
- Don't mix licensing: repo is public MIT/CC0; native version is closed source
