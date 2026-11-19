import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL, PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { grantIap, addCoins } from './economy';

// Consumable coin products — grant the matching coin amount on success.
// Keep in sync with store listing (coins_small = 250, etc).
const COIN_GRANTS: Record<string, number> = {
  coins_small:  250,
  coins_medium: 900,
  coins_large:  2500,
};
function grantCoinsForProduct(productId: string): number {
  const key = Object.keys(COIN_GRANTS).find(k => productId.includes(k));
  return key ? COIN_GRANTS[key] : 0;
}

const RC_KEYS = {
  ios:     'appl_LjAcpUJAArUKyuDOFUPxrqZYkSg',
  android: 'goog_UlDzxeXmQDObFMgIEHfKHGXGNcn',
};

let _initialized = false;

export async function initPurchases(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (_initialized) return;
  _initialized = true;

  const platform = Capacitor.getPlatform() as 'ios' | 'android';
  const key = RC_KEYS[platform] ?? RC_KEYS.android;

  await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
  await Purchases.configure({ apiKey: key });

  // Sync any existing entitlements on launch
  await syncEntitlements();
}

export async function syncEntitlements(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const active = customerInfo.entitlements.active;
    if (active['no_ads'])      await grantIap('remove_ads');
    if (active['starter_pack']) await grantIap('starter_pack');
  } catch (e) {
    console.warn('[Purchases] syncEntitlements failed', e);
  }
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch {
    return [];
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const active = customerInfo.entitlements.active;
    if (active['no_ads'])       await grantIap('remove_ads');
    if (active['starter_pack']) await grantIap('starter_pack');
    // Consumable coin packs — grant coins based on the product identifier.
    const coins = grantCoinsForProduct(pkg.product.identifier);
    if (coins > 0) await addCoins(coins);
    return true;
  } catch (e: any) {
    if (e?.userCancelled) return false;
    console.warn('[Purchases] purchase failed', e);
    return false;
  }
}

export async function restorePurchases(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const active = customerInfo.entitlements.active;
    if (active['no_ads'])       await grantIap('remove_ads');
    if (active['starter_pack']) await grantIap('starter_pack');
  } catch (e) {
    console.warn('[Purchases] restore failed', e);
  }
}
