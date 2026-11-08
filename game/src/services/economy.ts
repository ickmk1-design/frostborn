import { Storage } from './storage';

export interface EconomyState {
  coins: number;
  purchasedUpgrades: string[];  // 'extra_worker', 'carry_plus2', 'fast_chop'
  iapOwned: string[];           // 'remove_ads', 'starter_pack'
}

const KEY = 'frostborn_economy';

let _state: EconomyState = { coins: 0, purchasedUpgrades: [], iapOwned: [] };
let _loaded = false;

export async function loadEconomy(): Promise<EconomyState> {
  if (_loaded) return _state;
  try {
    const raw = await Storage.get(KEY);
    if (raw) _state = { ..._state, ...JSON.parse(raw) };
  } catch {}
  _loaded = true;
  return _state;
}

async function persist(): Promise<void> {
  await Storage.set(KEY, JSON.stringify(_state));
}

export function getCoins(): number { return _state.coins; }

export async function addCoins(amount: number): Promise<void> {
  _state.coins += amount;
  await persist();
}

export async function spendCoins(amount: number): Promise<boolean> {
  if (_state.coins < amount) return false;
  _state.coins -= amount;
  await persist();
  return true;
}

export function hasUpgrade(id: string): boolean {
  return _state.purchasedUpgrades.includes(id);
}

export async function buyUpgrade(id: string, cost: number): Promise<boolean> {
  if (hasUpgrade(id)) return true;
  const ok = await spendCoins(cost);
  if (!ok) return false;
  _state.purchasedUpgrades.push(id);
  await persist();
  return true;
}

export function hasIap(id: string): boolean {
  return _state.iapOwned.includes(id);
}

export async function grantIap(id: string): Promise<void> {
  if (!_state.iapOwned.includes(id)) {
    _state.iapOwned.push(id);
    if (id === 'starter_pack') {
      // starter pack includes remove_ads
      if (!_state.iapOwned.includes('remove_ads')) _state.iapOwned.push('remove_ads');
      _state.coins += 1000;
      if (!_state.purchasedUpgrades.includes('extra_worker')) {
        _state.purchasedUpgrades.push('extra_worker');
      }
    }
    await persist();
  }
}
