# Frostborn Pre-flight QA

Generated: 2026-11-12 04:58:52

**Summary: 67 PASS | 0 FAIL | 3 WARN | 8 MANUAL (needs device)**

> ✅ Automated checks passed. Complete MANUAL items on a real device before releasing.

## Results

| Status | Check | Detail |
|--------|-------|--------|
| PASS | Assets directory exists in dist | — |
| PASS | All sampled WebP assets exist | — |
| PASS | Audio files have OGG + M4A | — |
| PASS | Fredoka One font bundled locally | — |
| PASS | Sprite atlases present | — |
| PASS | index.html has no absolute /assets/ paths (Vite base is ./ | — |
| PASS | No Google Fonts external request in index.html | — |
| PASS | JS bundle size 1.81MB (< 3MB) | — |
| PASS | [WebKit] First frame under 3s | 257ms |
| PASS | [WebKit] Canvas rendered content | ~4KB dataURL |
| PASS | [WebKit] No JS errors on startup | — |
| PASS | [WebKit] No asset 404s | — |
| PASS | [Chromium] First frame under 3s | 1465ms |
| PASS | [Chromium] Canvas rendered content | ~13KB dataURL |
| PASS | [Chromium] No JS errors on startup | — |
| PASS | [Chromium] No asset 404s | — |
| PASS | [WebKit] Level select screenshot taken | — |
| PASS | [WebKit] Level 1 start — no new JS errors | — |
| PASS | [Chromium] Level select screenshot taken | — |
| PASS | [Chromium] Level 1 start — no new JS errors | — |
| PASS | [WebKit] Shop opens — no JS errors | — |
| PASS | [WebKit] Shop tap starter_pack: toast ✓ ("Satın alımlar yalnızca uygulamada çalışır") | — |
| PASS | [WebKit] Shop tap remove_ads: toast ✓ ("Satın alımlar yalnızca uygulamada çalışır") | — |
| PASS | [WebKit] Shop tap coins_small: toast ✓ ("Satın alımlar yalnızca uygulamada çalışır") | — |
| PASS | [WebKit] Shop tap coins_medium: toast ✓ ("Satın alımlar yalnızca uygulamada çalışır") | — |
| PASS | [WebKit] Shop tap coins_large: toast ✓ ("Satın alımlar yalnızca uygulamada çalışır") | — |
| PASS | [WebKit] Shop tap extra_worker: toast ✓ ("Yeterli jeton yok") | — |
| PASS | [WebKit] Shop tap carry_plus2: toast ✓ ("Yeterli jeton yok") | — |
| PASS | [WebKit] Shop tap fast_chop: toast ✓ ("Yeterli jeton yok") | — |
| PASS | [WebKit] Mute toggle — no JS errors | — |
| MANUAL | [WebKit] Sound plays after first tap (manual device test required) | — |
| MANUAL | [WebKit] Mute icon changes color visually (manual verification) | — |
| PASS | [WebKit] Level 1 direct URL — no JS errors | — |
| MANUAL | [WebKit] Win screen (must play to completion on device) | — |
| MANUAL | [WebKit] Lose screen (must let fire die out on device) | — |
| PASS | [WebKit] Economy state persists across reload | — |
| PASS | [WebKit] No JS errors after reload | — |
| PASS | [WebKit] Hero dir Right: facing d2 ✓ | — |
| PASS | [WebKit] Hero dir Right+Down: facing d1 ✓ | — |
| PASS | [WebKit] Hero dir Down: facing d0 ✓ | — |
| PASS | [WebKit] Hero dir Left+Down: facing d7 ✓ | — |
| PASS | [WebKit] Hero dir Left: facing d6 ✓ | — |
| PASS | [WebKit] Hero dir Left+Up: facing d5 ✓ | — |
| PASS | [WebKit] Hero dir Up: facing d4 ✓ | — |
| PASS | [WebKit] Hero dir Right+Up: facing d3 ✓ | — |
| PASS | [level01.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level02.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level03.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level04.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level05.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level06.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level07.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level08.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level09.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level10.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level11.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level12.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level13.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level14.json] No decor/tree overlaps build pads or fire | — |
| PASS | [level15.json] No decor/tree overlaps build pads or fire | — |
| PASS | [WebKit] wolf dir Right: d2 ✓ | — |
| PASS | [WebKit] wolf dir Right+Down: d1 ✓ | — |
| PASS | [WebKit] wolf dir Down: d0 ✓ | — |
| PASS | [WebKit] wolf dir Left+Down: d7 ✓ | — |
| PASS | [WebKit] wolf dir Left: d6 ✓ | — |
| PASS | [WebKit] wolf dir Left+Up: d5 ✓ | — |
| PASS | [WebKit] wolf dir Up: d4 ✓ | — |
| PASS | [WebKit] wolf dir Right+Up: d3 ✓ | — |
| WARN | [WebKit] No deer animal in level04 — skipping | — |
| PASS | [WebKit] Worker delivery level01 (3 workers): 39 deliveries ✓ | — |
| PASS | [WebKit] Worker delivery level08 (7 workers): 76 deliveries ✓ | — |
| PASS | [WebKit] Worker delivery level15 (12 workers): 130 deliveries ✓ | — |
| WARN | HUD top bar starts at y=50 (SAF=50) — verify no clipping behind status bar on iPhone 14+ (status bar is 54px; contentInset:always should offset this) | — |
| WARN | Shop/coin buttons at y=802 — verify not clipped by home indicator bar on devices with gesture nav (last 34px = y>810) | — |
| MANUAL | Safe areas — test on physical iPhone 14 Pro and iPhone SE (different notch/bar heights) | — |
| MANUAL | Android: test HUD and buttons not hidden behind navigation bar on API 36 edge-to-edge device | — |
| MANUAL | IAP calls fail gracefully in browser (no crash) — Capacitor guard returns no-op on web | — |
| MANUAL | Ad reward on native: grant ONLY after full watch; partial close → no reward (test on device) | — |

## Screenshots

Screenshots saved to `game/` directory:
- `screenshot-levelselect-webkit.png`
- `screenshot-game-webkit.png`
- `screenshot-shop-webkit.png`
- `screenshot-level1direct-webkit.png`
- `screenshot-levelselect-chromium.png`
- `screenshot-game-chromium.png`

## Fixes Applied This Session

1. **Black screen (root cause)**: `main.ts` awaited `initPurchases()` and `initAds()` before `new Phaser.Game()`. On iOS, both make network calls (guarded by `Capacitor.isNativePlatform()`). If either hung or threw, Phaser never started. Fixed: Phaser starts immediately after local storage loads; SDK inits run in background with 12-15s timeouts.

2. **Google Fonts blocking**: `<link rel="stylesheet" href="fonts.googleapis.com/...">` is render-blocking. On a device offline or with slow network, this stalls the entire page render. Fixed: Fredoka One bundled locally at `assets/fonts/FredokaOne.woff2`.

3. **No error visibility**: Added global `window.onerror` + `unhandledrejection` handlers that show a red error overlay on screen AND POST to `https://cytbilisim.com/frostborn-log` via `fetch` with `keepalive:true`.

## Server Logging Endpoint

Upload `server/frostborn-log.php` to your web server so it handles:
```
POST https://cytbilisim.com/frostborn-log
```
Errors are appended to `frostborn-errors.jsonl` on the server.
