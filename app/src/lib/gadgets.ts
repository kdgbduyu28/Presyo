// Gadget helpers. Pure (no RN imports) so they run under node --test.

import type { GadgetCountry, GadgetOffer, GadgetVariant } from './data';

/** Watchlist / alert id for one model variant ("g:iphone-17|256GB"). */
export function gadgetId(key: string, spec: string) {
  return `g:${key}|${spec}`;
}

export function parseGadgetId(id: string): { key: string; spec: string } | null {
  const m = /^g:([^|]+)\|(.+)$/.exec(id);
  return m ? { key: m[1], spec: m[2] } : null;
}

const buyable = (o: GadgetOffer) => o.price != null && o.stock !== false;

/** Lowest price you can buy now (in stock, or stock unknown as on Apple's site). */
export function bestOffer(v: GadgetVariant): GadgetOffer | undefined {
  return v.offers.filter(buyable).sort((a, b) => (a.price as number) - (b.price as number))[0];
}

/** Monthly payment for a straight installment plan with optional monthly add-on rate. */
export function installment(price: number, months: number, monthlyRate = 0): number {
  // round to centavos first so float noise (1120.0000001) doesn't add a peso
  return Math.ceil(Math.round(((price * (1 + monthlyRate * months)) / months) * 100) / 100);
}

export type AbroadRow = { country: GadgetCountry; price: number; php: number; vsPh: number | null; url: string };

/** Apple's price abroad in pesos, cheapest first; vsPh = share cheaper (+) or dearer (−) than the PH price. */
export function abroadRows(v: GadgetVariant, countries: GadgetCountry[], phPrice: number | null): AbroadRow[] {
  return (v.abroad ?? [])
    .map((a) => {
      const country = countries.find((c) => c.cc === a.cc);
      if (!country) return null;
      return { country, price: a.price, php: a.php, url: a.url, vsPh: phPrice ? (phPrice - a.php) / phPrice : null };
    })
    .filter((r): r is AbroadRow => r != null)
    .sort((a, b) => a.php - b.php);
}

/** "¥159,800", "$899", "S$1,449". */
export function money(price: number, cur: string): string {
  const sym: Record<string, string> = { USD: '$', JPY: '¥', SGD: 'S$', HKD: 'HK$', AED: 'AED ', SAR: 'SAR ' };
  const digits = cur === 'JPY' || Number.isInteger(price) ? 0 : 2;
  return `${sym[cur] ?? `${cur} `}${price.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Alerts whose target is met: id -> current price. */
export function metAlerts(alerts: Record<string, number>, prices: Record<string, number | null | undefined>) {
  const out: Record<string, number> = {};
  for (const [id, target] of Object.entries(alerts)) {
    const p = prices[id];
    if (p != null && p <= target) out[id] = p;
  }
  return out;
}
