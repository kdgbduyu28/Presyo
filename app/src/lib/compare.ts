// Two places side by side (e.g. home vs. work city). Pure (no RN imports) so it
// runs under node --test.

import { pickVariant, type OriginPref } from './basket.ts';

type Price = number | [number, number] | null;
type Row = { key: string; item: string; unit: string; cat: string; origin?: string; last: Price; period: string; variants?: Omit<Row, 'variants'>[] };

export type CompareRow = { key: string; item: string; unit: string; cat: string; a: number | null; b: number | null };

function mid(p: Price): number | null {
  if (p == null) return null;
  return typeof p === 'number' ? p : (p[0] + p[1]) / 2;
}

/** Headline items of both places by key (order of `a`, then items only `b` has),
 *  each side on the variant `origin` prefers. */
export function compareItems(a: Row[], b: Row[], origin: OriginPref = 'local'): CompareRow[] {
  const pick = (rows: Row[]) => new Map(rows.map((r) => [r.key, pickVariant(r, origin)]));
  const ma = pick(a);
  const mb = pick(b);
  const keys = [...ma.keys(), ...[...mb.keys()].filter((k) => !ma.has(k))];
  return keys.map((key) => {
    const x = ma.get(key) ?? mb.get(key)!;
    return { key, item: x.item, unit: x.unit, cat: x.cat, a: mid(ma.get(key)?.last ?? null), b: mid(mb.get(key)?.last ?? null) };
  });
}

/** Which side is cheaper: 'a', 'b' or null (missing, or within half a percent). */
export function cheaper(a: number | null, b: number | null): 'a' | 'b' | null {
  if (a == null || b == null || Math.abs(a - b) <= Math.max(a, b) * 0.005) return null;
  return a < b ? 'a' : 'b';
}
