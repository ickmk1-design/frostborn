import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
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

// ── Error overlay + server logging (active in all builds) ────────────────────
function _showErrorOverlay(msg: string): void {
  let el = document.getElementById('__frostborn_err') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = '__frostborn_err';
    el.style.cssText = [
      'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;',
      'color:#ff4444;font:13px/1.5 monospace;padding:20px;white-space:pre-wrap;',
      'z-index:99999;overflow:auto;word-break:break-all;',
    ].join('');
    document.body.appendChild(el);
  }
  el.textContent += msg + '\n\n';
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
  const text = `[onerror] ${msg}\n${src}:${line}:${col}\n${err?.stack ?? ''}`;
  _showErrorOverlay(text);
  _logToServer({ type: 'onerror', msg: String(msg), src, line, col, stack: err?.stack });
  return false;
};

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const msg = String(reason?.message ?? reason);
  const stack = reason?.stack ?? '';
  _showErrorOverlay(`[unhandledrejection] ${msg}\n${stack}`);
  _logToServer({ type: 'unhandledrejection', msg, stack });
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

  // Start Phaser immediately — never block on network or native SDK inits.
  new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#1a1a2e',
    parent: 'game',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 390,
      height: 844,
    },
    scene: [BootScene, LevelSelectScene, GameScene, UIScene, WinScene, LoseScene, ShopScene],
  });

  // SDK inits run in background after Phaser starts.
  // Each has an independent timeout so one hanging SDK cannot block another.
  _bg('initAppLifecycle', initAppLifecycle,  5000);
  _bg('initPurchases',    initPurchases,     15000);
  _bg('initAds',          initAds,           15000);
}

boot().catch(e => {
  const msg = String(e?.message ?? e);
  _showErrorOverlay(`[boot] FATAL: ${msg}\n${e?.stack ?? ''}`);
  _logToServer({ type: 'boot_fatal', msg, stack: e?.stack });
});
