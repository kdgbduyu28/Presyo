// Picking data for a location, entirely on-device. Pure functions (no RN
// imports) so they run under `node --test`.

export const NCR = '130000000';

export type PlaceRow = [
  code: string,
  name: string,
  province: string | null,
  region: string,
  lat: number,
  lng: number,
  flags: number, // 1 = DOE fuel data, 2 = its own PSA series, 4 = DOE LPG data
];

export type PlacesFile = {
  rows: PlaceRow[];
  names: Record<string, string>; // regions, provinces, NCR districts
  psa: string[]; // province/region codes with a PSA series
};

export type Market = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  area?: string;
  /** Location is only the city's centre (exact spot unknown). */
  approx?: boolean;
  /** Date of the market's most recent DA report. */
  last?: string;
};

export type Place = {
  code: string;
  name: string;
  province: string | null;
  region: string;
  lat: number;
  lng: number;
  hasFuel: boolean;
  hasPsa: boolean;
  hasLpg: boolean;
};

export function toPlace(r: PlaceRow): Place {
  return {
    code: r[0], name: r[1], province: r[2], region: r[3], lat: r[4], lng: r[5],
    hasFuel: (r[6] & 1) === 1, hasPsa: (r[6] & 2) === 2, hasLpg: (r[6] & 4) === 4,
  };
}

/** Great-circle distance in km. */
export function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest city/municipality by centroid. Good enough to name "where you are". */
export function nearestPlace(rows: PlaceRow[], lat: number, lng: number, filter?: (p: Place) => boolean) {
  let best: Place | null = null;
  let bestKm = Infinity;
  for (const r of rows) {
    const p = toPlace(r);
    if (filter && !filter(p)) continue;
    const d = km(lat, lng, p.lat, p.lng);
    if (d < bestKm) {
      best = p;
      bestKm = d;
    }
  }
  return best ? { place: best, km: bestKm } : null;
}

export type FoodSource =
  | { kind: 'da' }
  | { kind: 'psa'; code: string; level: 'city' | 'province' | 'region' };

/** Metro Manila gets DA's daily market prices; elsewhere PSA's monthly averages
 *  for the most specific area PSA publishes (city > province > region). */
export function foodSource(place: Place, psaAreas: string[]): FoodSource | null {
  if (place.region === NCR) return { kind: 'da' };
  if (place.hasPsa) return { kind: 'psa', code: place.code, level: 'city' };
  if (place.province && psaAreas.includes(place.province)) {
    return { kind: 'psa', code: place.province, level: 'province' };
  }
  if (psaAreas.includes(place.region)) return { kind: 'psa', code: place.region, level: 'region' };
  return null;
}

/** DOE only monitors some towns: use the user's own if covered, else the
 *  nearest covered one (reported with its distance so the UI can say so). */
export function fuelArea(rows: PlaceRow[], place: Place, lat: number, lng: number) {
  if (place.hasFuel) return { place, km: 0 };
  return nearestPlace(rows, lat, lng, (p) => p.hasFuel);
}

/** Same idea for DOE's monthly LPG monitoring. */
export function lpgArea(rows: PlaceRow[], place: Place, lat: number, lng: number) {
  if (place.hasLpg) return { place, km: 0 };
  return nearestPlace(rows, lat, lng, (p) => p.hasLpg);
}

/** Nearest markets still reporting. Markets placed at a city centre rank as
 *  if 3 km further away, so a known location wins over a guessed one. */
export function nearestMarkets(markets: Market[], lat: number, lng: number, n = 3, activeSince?: string) {
  return markets
    .filter((m) => !activeSince || !m.last || m.last >= activeSince)
    .map((m) => ({ market: m, km: km(lat, lng, m.lat, m.lng) }))
    .sort((a, b) => a.km + (a.market.approx ? 3 : 0) - (b.km + (b.market.approx ? 3 : 0)))
    .slice(0, n);
}

/** Markets that reported within `days` of the newest report (DA drops some over time). */
export function activeMarkets(markets: Market[], days = 30): Market[] {
  const newest = markets.reduce((a, m) => (m.last && m.last > a ? m.last : a), '');
  if (!newest) return markets;
  const cutoff = new Date(new Date(`${newest}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return markets.filter((m) => !m.last || m.last >= cutoff);
}

export function searchPlaces(file: PlacesFile, query: string, limit = 20): Place[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const scored: { p: Place; s: number }[] = [];
  for (const r of file.rows) {
    const name = fold(r[1]).replace(/^city of /, '');
    const prov = fold(file.names[r[2] ?? ''] ?? file.names[r[3]] ?? '');
    let s = -1;
    if (name.startsWith(q)) s = 0;
    else if (name.includes(q)) s = 1;
    else if (`${name} ${prov}`.includes(q)) s = 2;
    if (s >= 0) scored.push({ p: toPlace(r), s });
  }
  return scored
    .sort((a, b) => a.s - b.s || a.p.name.length - b.p.name.length)
    .slice(0, limit)
    .map((x) => x.p);
}

export function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
