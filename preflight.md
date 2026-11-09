# Frostborn Pre-flight QA

Generated: 2026-11-09 13:15:40

**Summary: 25 PASS | 0 FAIL | 2 WARN | 8 MANUAL (needs device)**

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
| PASS | JS bundle size 1.78MB (< 3MB) | — |
| PASS | [WebKit] First frame under 3s | 744ms |
| PASS | [WebKit] Canvas rendered content | ~4KB dataURL |
| PASS | [WebKit] No JS errors on startup | — |
| PASS | [WebKit] No asset 404s | — |
| PASS | [Chromium] First frame under 3s | 896ms |
| PASS | [Chromium] Canvas rendered content | ~13KB dataURL |
| PASS | [Chromium] No JS errors on startup | — |
| PASS | [Chromium] No asset 404s | — |
| PASS | [WebKit] Level select screenshot taken | — |
| PASS | [WebKit] Level 1 start — no new JS errors | — |
| PASS | [Chromium] Level select screenshot taken | — |
| PASS | [Chromium] Level 1 start — no new JS errors | — |
| PASS | [WebKit] Shop opens — no JS errors | — |
| PASS | [WebKit] Mute toggle — no JS errors | — |
| MANUAL | [WebKit] Sound plays after first tap (manual device test required) | — |
| MANUAL | [WebKit] Mute icon changes color visually (manual verification) | — |
| PASS | [WebKit] Level 1 direct URL — no JS errors | — |
| MANUAL | [WebKit] Win screen (must play to completion on device) | — |
| MANUAL | [WebKit] Lose screen (must let fire die out on device) | — |
| PASS | [WebKit] Economy state persists across reload | — |
| PASS | [WebKit] No JS errors after reload | — |
| WARN | HUD top bar starts at y=50 (SAF=50) — verify no clipping behind status bar on iPhone 14+ (status bar is 54px; contentInset:always should offset this) | — |
| WARN | Shop/coin buttons at y=802 — verify not clipped by home indicator bar on devices with gesture nav (last 34px = y>810) | — |
| MANUAL | Safe areas — test on physical iPhone 14 Pro and iPhone SE (different notch/bar heights) | — |
| MANUAL | Android: test HUD and buttons not hidden behind navigation bar on API 36 edge-to-edge device | — |
| MANUAL | IAP calls fail gracefully in browser (no crash) — Capacitor guard returns no-op on web | — |
| MANUAL | Ad calls fail gracefully in browser — showRewarded() gives instant reward on web | — |

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
