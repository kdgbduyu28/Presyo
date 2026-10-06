// Palengke basket: what a shopping list costs at each nearby market.
// Pure (no RN imports) so it runs under node --test.

import { km, type Market } from './places.ts';

type Price = number | [number, number] | null;

export type BasketItem = { key: string; label: string; unit: 'kg' | 'pc' | 'bottle'; step: number; start: number };

/** Items the DA tracks per market (and PSA per province), in list order. */
export const BASKET_ITEMS: BasketItem[] = [
  { key: 'rice_well_milled', label: 'Rice, well-milled', unit: 'kg', step: 1, start: 5 },
  { key: 'rice_regular', label: 'Rice, regular-milled', unit: 'kg', step: 1, start: 5 },
  { key: 'rice_premium', label: 'Rice, premium', unit: 'kg', step: 1, start: 5 },
  { key: 'pork_liempo', label: 'Pork liempo', unit: 'kg', step: 0.5, start: 1 },
  { key: 'pork_kasim', label: 'Pork kasim', unit: 'kg', step: 0.5, start: 1 },
  { key: 'chicken_whole', label: 'Whole chicken', unit: 'kg', step: 0.5, start: 1 },
  { key: 'egg_medium', label: 'Eggs (medium)', unit: 'pc', step: 6, start: 30 },
  { key: 'galunggong', label: 'Galunggong', unit: 'kg', step: 0.5, start: 1 },
  { key: 'bangus', label: 'Bangus', unit: 'kg', step: 0.5, start: 1 },
  { key: 'tilapia', label: 'Tilapia', unit: 'kg', step: 0.5, start: 1 },
  { key: 'tomato', label: 'Tomato', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'onion_red', label: 'Red onion', unit: 'kg', step: 0.25, start: 0.25 },
  { key: 'garlic', label: 'Garlic', unit: 'kg', step: 0.25, start: 0.25 },
  { key: 'cabbage', label: 'Cabbage', unit: 'kg', step: 0.5, start: 1 },
  { key: 'carrots', label: 'Carrots', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'potato', label: 'Potato', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'ampalaya', label: 'Ampalaya', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'pechay', label: 'Pechay', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'calamansi', label: 'Calamansi', unit: 'kg', step: 0.25, start: 0.25 },
  { key: 'sugar_refined', label: 'Sugar, refined', unit: 'kg', step: 0.5, start: 1 },
];

export type BasketLine = { key: string; qty: number };

/** One row of DA's latest per-market report (see build.py da/latest.json). */
export type LatestItem = { key?: string; origin?: string; unit: string; m: Record<string, Price> };

const ORIGIN_RANK: Record<string, number> = { local: 0, '': 1, imported: 2 };

function mid(p: Price): number | null {
  if (p == null) return null;
  return typeof p === 'number' ? p : (p[0] + p[1]) / 2;
}

/** Price of `key` at a market: local beats unlabelled beats imported. */
export function priceAt(items: LatestItem[], key: string, marketId: string): number | null {
  const options = items
    .filter((it) => it.key === key && mid(it.m[marketId] ?? null) != null)
    .sort((a, b) => (ORIGIN_RANK[a.origin ?? ''] ?? 1) - (ORIGIN_RANK[b.origin ?? ''] ?? 1));
  return options.length ? mid(options[0].m[marketId]) : null;
}

export type MarketTotal = { market: Market; km: number; total: number; missing: string[] };

/** Basket cost at markets within `maxKm`, complete baskets first, then cheapest. */
export function basketTotals(
  lines: BasketLine[], items: LatestItem[], markets: Market[], lat: number, lng: number, maxKm = 10,
): MarketTotal[] {
  const out: MarketTotal[] = [];
  for (const m of markets) {
    const d = km(lat, lng, m.lat, m.lng);
    if (d > maxKm) continue;
    let total = 0;
    const missing: string[] = [];
    for (const l of lines) {
      const p = priceAt(items, l.key, m.id);
      if (p == null) missing.push(l.key);
      else total += p * l.qty;
    }
    if (missing.length === lines.length) continue; // market reports none of it
    out.push({ market: m, km: d, total, missing });
  }
  return out.sort((a, b) => a.missing.length - b.missing.length || a.total - b.total);
}

/** Basket cost from one area's averages (PSA, outside Metro Manila). */
export function basketFromAverages(lines: BasketLine[], prices: Record<string, number>) {
  let total = 0;
  const missing: string[] = [];
  for (const l of lines) {
    const p = prices[l.key];
    if (p == null) missing.push(l.key);
    else total += p * l.qty;
  }
  return { total, missing };
}
