## Patch for `game/src/services/ads.ts`

Apply this file **after the playtest ends**. Replace the entire contents of `game/src/services/ads.ts` with the single fenced block below.

**What this changes vs. current (commit 463b5f53):**
1. Adds explicit ATT prompt via `AdMob.requestTrackingAuthorization()`, gated by `localStorage['frostborn_att_asked']` so it only fires once. Called AFTER UMP consent resolves and BEFORE any ad preload.
2. Adds `canRequestAds` gate — reads it from the `AdmobConsentInfo` returned by `requestConsentInfo` / `showConsentForm` and stores it. `prepareRewardVideoAd` and `prepareInterstitial` early-return with a console warning when the gate is `false`.
3. Removed the stale `requestTrackingAuthorization` comment inside `AdMob.initialize({…})` — that option is not part of `AdMobInitializationOptions` in `@capacitor-community/admob@7.2.0`. ATT is handled by calling `AdMob.requestTrackingAuthorization()` explicitly.

```ts
import { Capacitor } from '@capacitor/core';
import { AdMob, AdOptions, RewardAdPluginEvents, InterstitialAdPluginEvents, AdMobRewardItem } from '@capacitor-community/admob';
import { hasIap } from './economy';

// ── Ad Unit IDs ───────────────────────────────────────────────────────────────
const IDS = {
  ios: {
    app:          'ca-app-pub-2172235968793446~4224628453',
    rewarded:     'ca-app-pub-2172235968793446/3977216441',
    interstitial: 'ca-app-pub-2172235968793446/8968708737',
  },
  android: {
    app:          'ca-app-pub-2172235968793446~6973100783',
    rewarded:     'ca-app-pub-2172235968793446/1720774101',
    interstitial: 'ca-app-pub-2172235968793446/9407692433',
  },
  test: {
    rewarded:     'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
};

const IS_DEV = !Capacitor.isNativePlatform() || ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false);
const PLATFORM = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

function rewardedId():     string { return IS_DEV ? IDS.test.rewarded     : IDS[PLATFORM === 'ios' ? 'ios' : 'android'].rewarded; }
function interstitialId(): string { return IS_DEV ? IDS.test.interstitial : IDS[PLATFORM === 'ios' ? 'ios' : 'android'].interstitial; }

// ── Interstitial rate-limiting ────────────────────────────────────────────────
let lastInterstitialTime = 0;
let levelsSinceLastInterstitial = 0;
const MIN_INTERVAL_MS  = 3 * 60 * 1000; // 3 minutes
const MIN_LEVEL_GAP    = 2;

let _initialized = false;

// ── Consent / ATT gate ───────────────────────────────────────────────────────
// Set after UMP + ATT resolve. If false, SKIP all ad preload / show calls.
let _canRequestAds = false;

const ATT_ASKED_KEY = 'frostborn_att_asked';

async function _askAttOnceIfNeeded(): Promise<void> {
  if (PLATFORM !== 'ios') return;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(ATT_ASKED_KEY) === '1') return;
    const status = await AdMob.trackingAuthorizationStatus();
    if (status?.status === 'notDetermined') {
      await AdMob.requestTrackingAuthorization();
    }
    try { localStorage?.setItem(ATT_ASKED_KEY, '1'); } catch {}
  } catch (e) {
    console.warn('[Ads] ATT prompt failed', e);
  }
}

// ── Init + Consent ────────────────────────────────────────────────────────────
export async function initAds(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (_initialized) return;
  _initialized = true;

  await AdMob.initialize({
    testingDevices: [],
    initializeForTesting: IS_DEV,
  });

  // UMP consent (GDPR). Returns AdmobConsentInfo { status, canRequestAds, … }
  let consentInfo = await AdMob.requestConsentInfo({});
  if (consentInfo.isConsentFormAvailable && consentInfo.status === 'REQUIRED') {
    try {
      const after = await AdMob.showConsentForm();
      if (after) consentInfo = after;
    } catch (e) {
      console.warn('[Ads] consent form failed', e);
    }
  }
  _canRequestAds = consentInfo.canRequestAds !== false;

  // iOS 14+ ATT prompt — AFTER UMP resolves, BEFORE any ad load. Once per install.
  await _askAttOnceIfNeeded();

  if (!_canRequestAds) {
    console.warn('[Ads] canRequestAds=false after UMP — skipping ad preload');
    return;
  }

  // Preload interstitial for fast display
  _preloadInterstitial();
}

// ── Rewarded Ad ───────────────────────────────────────────────────────────────
export async function showRewarded(
  onRewarded: () => void,
  onDismissed?: () => void,
  onNotNative?: () => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug');
    if (isDebug) {
      onRewarded(); // instant grant — only for ?debug testing
    } else {
      (onNotNative ?? onDismissed)?.();
    }
    return;
  }

  if (!_canRequestAds) {
    console.warn('[Ads] rewarded skipped — canRequestAds=false (consent not granted)');
    onDismissed?.();
    return;
  }

  const opts: AdOptions = { adId: rewardedId() };
  try {
    await AdMob.prepareRewardVideoAd(opts);
    const result = await new Promise<AdMobRewardItem | null>((resolve) => {
      AdMob.addListener(RewardAdPluginEvents.Rewarded, (item) => { resolve(item as AdMobRewardItem); });
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => { resolve(null); });
      AdMob.showRewardVideoAd();
    });
    if (result) onRewarded();
    else onDismissed?.();
  } catch (e) {
    console.warn('[Ads] rewarded failed', e);
    onDismissed?.();
  }
}

// ── Interstitial Ad ───────────────────────────────────────────────────────────
let _interstitialLoaded = false;

async function _preloadInterstitial(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!_canRequestAds) {
    console.warn('[Ads] interstitial preload skipped — canRequestAds=false');
    return;
  }
  try {
    await AdMob.prepareInterstitial({ adId: interstitialId() });
    _interstitialLoaded = true;
  } catch {}
}

export async function maybeShowInterstitial(completedLevelNum: number): Promise<void> {
  if (hasIap('remove_ads')) return;
  if (completedLevelNum < 4) return;              // only after level 4
  if (!_interstitialLoaded) return;
  if (!_canRequestAds) return;

  const now = Date.now();
  if (now - lastInterstitialTime < MIN_INTERVAL_MS) return;
  levelsSinceLastInterstitial++;
  if (levelsSinceLastInterstitial < MIN_LEVEL_GAP) return;

  if (!Capacitor.isNativePlatform()) return;

  lastInterstitialTime = now;
  levelsSinceLastInterstitial = 0;
  _interstitialLoaded = false;

  await new Promise<void>((resolve) => {
    AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => resolve());
    AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => resolve());
    AdMob.showInterstitial();
  });

  // Preload next
  _preloadInterstitial();
}
```

### Line-reference audit vs. current file (commit 463b5f53)

| Change | Current line | New behavior |
|--------|--------------|--------------|
| ATT prompt (one-shot) | line 44 comment removed; new `_askAttOnceIfNeeded()` helper + call after UMP in `initAds()` | Calls `AdMob.requestTrackingAuthorization()` only if `trackingAuthorizationStatus().status === 'notDetermined'` and `localStorage['frostborn_att_asked'] !== '1'`. Sets the flag afterwards. |
| `canRequestAds` gate | new `_canRequestAds` module var, captured from `requestConsentInfo` return and from `showConsentForm` return | Early-return in `initAds` (no preload), in `showRewarded` (calls `onDismissed`), in `_preloadInterstitial`, in `maybeShowInterstitial`. |
| Removed import | `AdLoadInfo` was imported but unused in current file — dropped | No TS unused-import warning. |
| Removed stale comment | line 44 | ATT is not a config option in v7.2.0 `AdMobInitializationOptions`. Handled by explicit `AdMob.requestTrackingAuthorization()` call. |

Nothing else changes. Public API (`initAds`, `showRewarded`, `maybeShowInterstitial`) and all IDs are identical.
