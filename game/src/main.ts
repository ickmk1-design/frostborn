import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import MainMenuScene from './scenes/MainMenuScene';
import SettingsScene from './scenes/SettingsScene';
import LevelSelectScene from './scenes/LevelSelectScene';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';
import WinScene from './scenes/WinScene';
import LoseScene from './scenes/LoseScene';
import ShopScene from './scenes/ShopScene';
import { loadProgress } from './progress';
import { loadEconomy } from './services/economy';
import { initAppLifecycle } from './services/appLifecycle';
import { initAds } from './services/ads';
import { initPurchases } from './services/purchases';

// ── Known non-fatal errors to suppress from UI ───────────────────────────────
const _IGNORE_PATTERNS = [
  /failed to start the audio/i,
  /audiocontext/i,
  /audio device/i,
  /notallowederror/i,   // audio autoplay policy
  /the play\(\) request was interrupted/i,
];

function _isFatal(msg: string): boolean {
  return !_IGNORE_PATTERNS.some(p => p.test(msg));
}

// ── Small dismissible banner (never full-screen) ──────────────────────────────
function _showErrorBanner(msg: string): void {
  let el = document.getElementById('__frostborn_err') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = '__frostborn_err';
    el.style.cssText = [
      'position:fixed;top:0;left:0;right:0;max-height:120px;overflow:auto;',
      'background:rgba(180,0,0,0.88);color:#fff;font:12px/1.4 monospace;',
      'padding:8px 36px 8px 12px;white-space:pre-wrap;word-break:break-all;',
      'z-index:99999;pointer-events:auto;',
    ].join('');
    // Dismiss button
    const x = document.createElement('button');
    x.textContent = '✕';
    x.style.cssText = 'position:absolute;top:4px;right:8px;background:none;border:none;color:#fff;font-size:16px;cursor:pointer;';
    x.onclick = () => el?.remove();
    el.appendChild(x);
    document.body.appendChild(el);
  }
  const line = document.createElement('div');
  line.textContent = msg;
  el.insertBefore(line, el.firstChild);
}

function _logToServer(data: Record<string, unknown>): void {
  try {
    fetch('https://cytbilisim.com/frostborn-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'frostborn',
        ts: new Date().toISOString(),
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        ...data,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* silent */ }
}

window.onerror = (msg, src, line, col, err) => {
  const text = `[onerror] ${msg}\n${src}:${line}:${col}`;
  _logToServer({ type: 'onerror', msg: String(msg), src, line, col, stack: err?.stack });
  if (_isFatal(String(msg))) _showErrorBanner(text);
  return false;
};

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const msg = String(reason?.message ?? reason);
  const stack = reason?.stack ?? '';
  _logToServer({ type: 'unhandledrejection', msg, stack });
  if (_isFatal(msg)) _showErrorBanner(`[unhandledrejection] ${msg}`);
  // Prevent the browser from logging it to console as uncaught
  e.preventDefault();
});

// ── Non-blocking background init helper ──────────────────────────────────────
function _bg(label: string, fn: () => Promise<void>, timeoutMs = 12000): void {
  const p = fn().catch(e => {
    const msg = String(e?.message ?? e);
    console.warn(`[boot] ${label}:`, msg);
    _logToServer({ type: 'bg_init_error', label, msg, stack: e?.stack });
  });
  const timer = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
  );
  Promise.race([p, timer]).catch(e => {
    const msg = String(e?.message ?? e);
    console.warn(`[boot] ${label} timed out:`, msg);
    _logToServer({ type: 'bg_init_timeout', label, msg });
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  // Local storage only — must complete before Phaser so scenes have sync access to data.
  // These use Capacitor Preferences (native) or localStorage (web) and have no network calls.
  await loadProgress().catch(e => console.warn('[boot] loadProgress:', e));
  await loadEconomy().catch(e => console.warn('[boot] loadEconomy:', e));

  // Ensure GameFont is loaded before creating any Phaser text
  try { await document.fonts.load('400 24px GameFont'); } catch { /* ok */ }

  // Hide the HTML splash now that JS has parsed and Phaser is about to start.
  try { (window as any).__hideSplash?.(); } catch { /* ok */ }

  // ── DPR sharpness fix ────────────────────────────────────────────────────
  // Phaser 4 has no built-in resolution option; monkey-patch Text factory so
  // every text object automatically renders at device pixel density.
  const _dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (_dpr > 1) {
    const _origText = (Phaser.GameObjects.GameObjectFactory.prototype as any).text;
    (Phaser.GameObjects.GameObjectFactory.prototype as any).text = function (...args: unknown[]) {
      return (_origText.apply(this, args) as Phaser.GameObjects.Text).setResolution(_dpr);
    };
  }

  // Start Phaser immediately — never block on network or native SDK inits.
  const __phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#1a1a2e',
    parent: 'game',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    scene: [BootScene, MainMenuScene, SettingsScene, LevelSelectScene, GameScene, UIScene, WinScene, LoseScene, ShopScene],
  });

  (window as any).__game = __phaserGame;

  // SDK inits run in background after Phaser starts.
  // Each has an independent timeout so one hanging SDK cannot block another.
  _bg('initAppLifecycle', initAppLifecycle,  5000);
  _bg('initPurchases',    initPurchases,     15000);
  _bg('initAds',          initAds,           15000);
}

boot().catch(e => {
  const msg = String(e?.message ?? e);
  _showErrorBanner(`[boot] FATAL: ${msg}`);
  _logToServer({ type: 'boot_fatal', msg, stack: e?.stack });
});
