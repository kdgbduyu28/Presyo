// Palengke basket: what a shopping list costs at each nearby market.
// Pure (no RN imports) so it runs under node --test.

import { km, type Market } from './places.ts';

type Price = number | [number, number] | null;

export type BasketItem = {
  key: string; cat: string; label: string; unit: 'kg' | 'pc' | 'bottle'; step: number; start: number;
};

/** Items the DA tracks per market (and PSA per province), in list order. */
export const BASKET_ITEMS: BasketItem[] = [
  { key: 'rice_well_milled', cat: 'rice', label: 'Rice, well-milled', unit: 'kg', step: 1, start: 5 },
  { key: 'rice_regular', cat: 'rice', label: 'Rice, regular-milled', unit: 'kg', step: 1, start: 5 },
  { key: 'rice_premium', cat: 'rice', label: 'Rice, premium', unit: 'kg', step: 1, start: 5 },
  { key: 'pork_liempo', cat: 'meat', label: 'Pork liempo', unit: 'kg', step: 0.5, start: 1 },
  { key: 'pork_kasim', cat: 'meat', label: 'Pork kasim', unit: 'kg', step: 0.5, start: 1 },
  { key: 'chicken_whole', cat: 'meat', label: 'Whole chicken', unit: 'kg', step: 0.5, start: 1 },
  { key: 'egg_medium', cat: 'meat', label: 'Eggs (medium)', unit: 'pc', step: 6, start: 30 },
  { key: 'galunggong', cat: 'seafood', label: 'Galunggong', unit: 'kg', step: 0.5, start: 1 },
  { key: 'bangus', cat: 'seafood', label: 'Bangus', unit: 'kg', step: 0.5, start: 1 },
  { key: 'tilapia', cat: 'seafood', label: 'Tilapia', unit: 'kg', step: 0.5, start: 1 },
  { key: 'tomato', cat: 'vegetables', label: 'Tomato', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'onion_red', cat: 'vegetables', label: 'Red onion', unit: 'kg', step: 0.25, start: 0.25 },
  { key: 'garlic', cat: 'vegetables', label: 'Garlic', unit: 'kg', step: 0.25, start: 0.25 },
  { key: 'cabbage', cat: 'vegetables', label: 'Cabbage', unit: 'kg', step: 0.5, start: 1 },
  { key: 'carrots', cat: 'vegetables', label: 'Carrots', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'potato', cat: 'vegetables', label: 'Potato', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'ampalaya', cat: 'vegetables', label: 'Ampalaya', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'pechay', cat: 'vegetables', label: 'Pechay', unit: 'kg', step: 0.25, start: 0.5 },
  { key: 'calamansi', cat: 'fruits', label: 'Calamansi', unit: 'kg', step: 0.25, start: 0.25 },
  { key: 'sugar_refined', cat: 'pantry', label: 'Sugar, refined', unit: 'kg', step: 0.5, start: 1 },
];

export type BasketLine = { key: string; qty: number };

/** One row of DA's latest per-market report (see build.py da/latest.json). */
export type LatestItem = { key?: string; origin?: string; unit: string; m: Record<string, Price> };

export type OriginPref = 'local' | 'imported' | 'any';

const ORIGIN_RANK: Record<OriginPref, Record<string, number>> = {
  local: { local: 0, '': 1, imported: 2 },
  imported: { imported: 0, '': 1, local: 2 },
  any: {},
};

function mid(p: Price): number | null {
  if (p == null) return null;
  return typeof p === 'number' ? p : (p[0] + p[1]) / 2;
}

/** Price of `key` at a market. `origin`: which variant wins when both are sold
 *  ("local" by default: local, then unlabelled, then imported); "any" = cheapest. */
export function priceAt(items: LatestItem[], key: string, marketId: string, origin: OriginPref = 'local'): number | null {
  const prices = items
    .filter((it) => it.key === key && mid(it.m[marketId] ?? null) != null)
    .map((it) => ({ rank: ORIGIN_RANK[origin][it.origin ?? ''] ?? 1, p: mid(it.m[marketId]) as number }))
    .sort((a, b) => a.rank - b.rank || a.p - b.p);
  return prices.length ? prices[0].p : null;
}

/** The Today card's row for an item: the variant `origin` prefers (same order as priceAt).
 *  The summary's top-level row is local first; the others are in `variants`. */
export function pickVariant<T extends { origin?: string; last: Price; variants?: Omit<T, 'variants'>[] }>(
  it: T, origin: OriginPref,
): T {
  if (!it.variants?.length) return it;
  const { variants, ...top } = it;
  const all = [top, ...variants] as T[];
  const p = (x: T) => mid(x.last) ?? Infinity;
  return all.map((x) => ({ x, rank: ORIGIN_RANK[origin][x.origin ?? ''] ?? 1 }))
    .sort((a, b) => a.rank - b.rank || p(a.x) - p(b.x))[0].x;
}

export type MarketTotal ={ market: Market; km: number; total: number; missing: string[] };

export type BasketOptions = { maxKm?: number; origin?: OriginPref; favourites?: string[] };

/** Basket cost at markets within `maxKm` (favourites always), complete baskets first, then cheapest. */
export function basketTotals(
  lines: BasketLine[], items: LatestItem[], markets: Market[], lat: number, lng: number,
  { maxKm = 10, origin = 'local', favourites = [] }: BasketOptions = {},
): MarketTotal[] {
  const out: MarketTotal[] = [];
  for (const m of markets) {
    const d = km(lat, lng, m.lat, m.lng);
    if (d > maxKm && !favourites.includes(m.id)) continue;
    let total = 0;
    const missing: string[] = [];
    for (const l of lines) {
      const p = priceAt(items, l.key, m.id, origin);
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

/** One price series from the DA/PSA history files (da/index-<cat>.json, psa/<code>.json). */
export type HistoryItem = { key?: string; origin?: string; s: Price[] };

export type BasketPoint = { period: string; total: number; missing: string[] };

/** Monday of the week of an ISO date, e.g. "2026-10-22" -> "2026-10-19". */
export function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** What the list cost each week (daily DA averages) or month (PSA): the price on the
 *  last report of each period, carrying an item's last known price over gaps. Same
 *  variant rule as the market totals. The last `count` periods, oldest first. */
export function basketHistory(
  lines: BasketLine[], items: HistoryItem[], periods: string[],
  { origin = 'local', by = 'week', count = 12 }: { origin?: OriginPref; by?: 'week' | 'month'; count?: number } = {},
): BasketPoint[] {
  const byKey = new Map<string, HistoryItem[]>();
  for (const it of items) if (it.key) byKey.set(it.key, [...(byKey.get(it.key) ?? []), it]);
  const known: Record<string, number> = {};
  const out: BasketPoint[] = [];
  for (let i = 0; i < periods.length; i++) {
    for (const l of lines) {
      const best = (byKey.get(l.key) ?? [])
        .map((it) => ({ rank: ORIGIN_RANK[origin][it.origin ?? ''] ?? 1, p: mid(it.s[i] ?? null) }))
        .filter((x): x is { rank: number; p: number } => x.p != null)
        .sort((a, b) => a.rank - b.rank || a.p - b.p)[0];
      if (best) known[l.key] = best.p;
    }
    const bucket = by === 'week' ? weekOf(periods[i]) : periods[i].slice(0, 7);
    // only the last report of a bucket counts
    if (i + 1 < periods.length && (by === 'week' ? weekOf(periods[i + 1]) : periods[i + 1].slice(0, 7)) === bucket) continue;
    const missing = lines.filter((l) => known[l.key] == null).map((l) => l.key);
    if (missing.length === lines.length) continue;
    out.push({ period: bucket, total: lines.reduce((sum, l) => sum + (known[l.key] ?? 0) * l.qty, 0), missing });
  }
  return out.slice(-count);
}
