// Bill and fare arithmetic for the Electricity, Water, Fares and Forex tabs.
// Pure (no RN imports) so it runs under node --test.

// ---------- PUV fares (LTFRB)

export type FareMode = {
  id: string;
  name: string;
  base: number;
  base_km: number;
  per_km: number;
  prev_base?: number;
  prev_per_km?: number;
};

export type FaresFile = {
  checked: string;
  effective: string;
  status: string;
  discount: { pct: number; who: string };
  rounding: number;
  modes: FareMode[];
  sources: string[];
};

/** Fare for a trip, as on the LTFRB matrix: minimum fare covers the first
 *  `base_km`, each started km after that adds `per_km`, rounded to the nearest
 *  25 centavos. Discounted fares are 80% of the regular fare, rounded the same way. */
export function fare(
  m: Pick<FareMode, 'base' | 'base_km' | 'per_km'>,
  km: number,
  opts: { discountPct?: number; rounding?: number } = {},
): number {
  const step = opts.rounding ?? 0.25;
  const extra = Math.max(0, Math.ceil(km - 1e-9) - m.base_km);
  const regular = m.base + extra * m.per_km;
  const pay = opts.discountPct ? regular * (1 - opts.discountPct / 100) : regular;
  return Math.round(pay / step) * step;
}

// ---------- Meralco: bill at any kWh from the published table

export type BillPoint = [kwh: number, bill: number];

// Meralco's distribution charge per kWh steps up for the whole bill above
// these levels, so the bill is linear only within a band.
const BANDS = [200, 300, 400];
function band(kwh: number) {
  const i = BANDS.findIndex((top) => kwh <= top);
  return i === -1 ? BANDS.length : i;
}

/** Estimated monthly bill (₱) for `kwh`, from Meralco's "bills at typical
 *  consumption levels" table (non-lifeline). */
export function meralcoBill(points: BillPoint[], kwh: number): number | null {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (pts.length < 2 || !(kwh > 0)) return null;
  const hit = pts.find((p) => p[0] === kwh);
  if (hit) return hit[1];
  // Fixed charges (customer + metering, with VAT): intercept of the first band.
  const low = pts.filter((p) => p[0] <= BANDS[0]);
  const [a, b] = low.length >= 2 ? low.slice(-2) : pts.slice(0, 2);
  const fixed = a[1] - a[0] * ((b[1] - a[1]) / (b[0] - a[0]));
  const above = pts.find((p) => p[0] > kwh);
  if (!above) {
    const [p, q] = pts.slice(-2);
    return q[1] + (kwh - q[0]) * ((q[1] - p[1]) / (q[0] - p[0]));
  }
  const below = [...pts].reverse().find((p) => p[0] < kwh);
  if (below && band(below[0]) === band(kwh) && band(above[0]) === band(kwh)) {
    return below[1] + (kwh - below[0]) * ((above[1] - below[1]) / (above[0] - below[0]));
  }
  // Only the band's top level is in the table: scale its per-kWh part.
  return fixed + (above[1] - fixed) * (kwh / above[0]);
}

// ---------- Water (MWSS concessionaires)

export type WaterAdjustment = {
  quarter: string;
  start: string;
  per_cum: number;
  what: string;
  bill?: Record<string, number>;
  source: string;
};

export type Concessionaire = {
  id: string;
  name: string;
  zone: string;
  url: string;
  all_in: {
    effective: string; unsewered: number; sewered: number;
    prev_unsewered?: number; prev_sewered?: number; source: string;
  };
  areas: { all: string[]; part: string[] };
  adjustments: WaterAdjustment[];
};

export type WaterFile = { checked: string; concessionaires: Concessionaire[] };

/** Concessionaires serving a city/town: one, both (split cities), or none. */
export function waterProviders(file: WaterFile, code: string): Concessionaire[] {
  const whole = file.concessionaires.filter((c) => c.areas.all.includes(code));
  if (whole.length) return whole;
  return file.concessionaires.filter((c) => c.areas.part.includes(code));
}

// ---------- Forex

/** Small currencies read better per 100 or 1,000 units (yen, won, rupiah). */
export function fxPer(rate: number): number {
  return rate < 0.01 ? 1000 : rate < 1 ? 100 : 1;
}
