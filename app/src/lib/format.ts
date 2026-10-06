// Formatting + series helpers. Pure (no RN imports) so they run under node --test.

export type Price = number | [number, number] | null;

/** Midpoint for ranges, so a series can be charted and compared. */
export function value(p: Price): number | null {
  if (p == null) return null;
  return typeof p === 'number' ? p : (p[0] + p[1]) / 2;
}

export function peso(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pesoPrice(p: Price): string {
  if (p == null) return '—';
  if (typeof p === 'number') return peso(p);
  return `${peso(p[0])}–${p[1].toFixed(2)}`;
}

export const UNIT_LABEL: Record<string, string> = { kg: '/kg', pc: '/pc', L: '/L', tank: '/tank', bottle: '/bottle' };

/** Latest non-null value and the one before it. */
export function lastTwo(series: Price[]): { last: number | null; lastIdx: number; prev: number | null } {
  let lastIdx = -1;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] != null) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx < 0) return { last: null, lastIdx, prev: null };
  let prev: number | null = null;
  for (let i = lastIdx - 1; i >= 0; i--) {
    const v = value(series[i]);
    if (v != null) {
      prev = v;
      break;
    }
  }
  return { last: value(series[lastIdx]), lastIdx, prev };
}

export function change(last: number | null, prev: number | null): number | null {
  if (last == null || prev == null || prev === 0) return null;
  return (last - prev) / prev;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** "2026-10-05" -> "Oct 5"; "2026-09" -> "September 2026". */
export function periodLabel(p: string): string {
  const [y, m, d] = p.split('-').map(Number);
  if (d == null) return `${MONTHS_LONG[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${d}`;
}

export function rangeLabel(start: string, end: string): string {
  const [, sm] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  return sm === em ? `${periodLabel(start)}–${ed}` : `${periodLabel(start)} – ${periodLabel(end)}`;
}

export function daysAgo(iso: string, now = new Date()): number {
  const t = new Date(`${iso.length === 7 ? `${iso}-01` : iso}T00:00:00+08:00`).getTime();
  return Math.floor((now.getTime() - t) / 86_400_000);
}
