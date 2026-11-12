import { Capacitor } from '@capacitor/core';
import { AdMob, AdOptions, RewardAdPluginEvents, InterstitialAdPluginEvents, AdLoadInfo, AdMobRewardItem } from '@capacitor-community/admob';
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

// ── Init + Consent ────────────────────────────────────────────────────────────
export async function initAds(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (_initialized) return;
  _initialized = true;

  await AdMob.initialize({
    // requestTrackingAuthorization: true  — triggers ATT on iOS 14+; configure in Info.plist
    testingDevices: [],
    initializeForTesting: IS_DEV,
  });

  // UMP consent (GDPR)
  const consentInfo = await AdMob.requestConsentInfo({});
  if (consentInfo.isConsentFormAvailable && consentInfo.status === 'REQUIRED') {
    await AdMob.showConsentForm();
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
  try {
    await AdMob.prepareInterstitial({ adId: interstitialId() });
    _interstitialLoaded = true;
  } catch {}
}

export async function maybeShowInterstitial(completedLevelNum: number): Promise<void> {
  if (hasIap('remove_ads')) return;
  if (completedLevelNum < 4) return;              // only after level 4
  if (!_interstitialLoaded) return;

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
