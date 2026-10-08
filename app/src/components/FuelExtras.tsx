import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AdjustFile, AdjustWeek, LpgFile, LpgMonthly, useJson } from '../lib/data';
import { peso, pesoPrice, periodLabel, rangeLabel, value } from '../lib/format';
import type { Spot } from '../lib/location';
import { placeName } from '../lib/names';
import { lpgArea, NCR, Place, PlacesFile } from '../lib/places';
import { usePrefs } from '../lib/prefs';
import { C, R, themed } from '../theme';
import { Chart } from './Chart';
import { Card, Notice, PriceRow, SectionTitle } from './bits';
import { Sheet } from './Sheet';

// ---------------------------------------------------------------- adjustments

const ADJ_LABEL: Record<string, string> = { gasoline: 'Gasoline', diesel: 'Diesel', kerosene: 'Kerosene' };

/** Newest complete week of DOE's price-change notices. */
export function useLatestAdjustment(): AdjustWeek | null {
  const { data } = useJson<AdjustFile>('fuel/adjust.json');
  return useMemo(() => {
    const ok = (data?.weeks ?? []).filter((w) => w.status === 'ok');
    return ok.length ? ok[ok.length - 1] : null;
  }, [data]);
}

function signed(n: number): string {
  if (Math.abs(n) < 0.005) return '₱0.00';
  return `${n > 0 ? '▲' : '▼'} ₱${Math.abs(n).toFixed(2)}`;
}

/** "Price changes from Sep 29: Gasoline ▼ −₱0.24 · Diesel ▼ −₱7.57 /L". */
export function AdjustmentBanner({ week, compact }: { week: AdjustWeek; compact?: boolean }) {
  const order = ['gasoline', 'diesel', 'kerosene'].filter((k) => week.products[k]);
  const n = Math.max(...order.map((k) => week.products[k].n));
  return (
    <View style={[s.banner, compact && { marginHorizontal: 0 }]}>
      <Text style={s.bannerTitle}>Pump price changes · week of {rangeLabel(week.start, week.end)}</Text>
      <View style={s.bannerRow}>
        {order.map((k) => {
          const v = week.products[k].median;
          return (
            <View key={k} style={s.adj}>
              <Text style={s.adjLabel}>{ADJ_LABEL[k]}</Text>
              <Text style={[s.adjValue, { color: v > 0 ? C.up : v < 0 ? C.down : C.muted }]}>{signed(v)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={s.bannerNote}>Per liter, typical across {n} oil companies (DOE prior notices).</Text>
    </View>
  );
}

// ---------------------------------------------------------------- LPG

type LpgSummary = { main: number | null; lo: number | null; hi: number | null; brands: { brand: string; p: number | [number, number] | null }[] };

function summarizeLpg(rows: LpgFile['months'][number]['rows']): LpgSummary {
  const brands = rows.filter((r) => r.brand).map((r) => ({ brand: r.brand!, p: r.p }))
    .sort((a, b) => (value(a.p) ?? 0) - (value(b.p) ?? 0));
  const common = rows.find((r) => !r.brand);
  const mids = brands.map((b) => value(b.p)).filter((v): v is number => v != null);
  const lows = brands.map((b) => (typeof b.p === 'number' ? b.p : b.p?.[0])).filter((v): v is number => v != null);
  const highs = brands.map((b) => (typeof b.p === 'number' ? b.p : b.p?.[1])).filter((v): v is number => v != null);
  return {
    main: value(common?.p ?? null) ?? (mids.length ? mids[Math.floor(mids.length / 2)] : null),
    lo: lows.length ? Math.min(...lows) : null,
    hi: highs.length ? Math.max(...highs) : null,
    brands,
  };
}

/** Nearest DOE-monitored LPG prices: { label, month, summary } or null. */
export function useLpg(place: Place, spot: Spot, places: PlacesFile) {
  const area = useMemo(() => lpgArea(places.rows, place, spot.lat, spot.lng), [places, place, spot]);
  const { data } = useJson<LpgFile>(area && area.km < 60 ? `lpg/${area.place.code}.json` : null);
  return useMemo(() => {
    if (!area || !data?.months.length) return null;
    const month = data.months[data.months.length - 1];
    return { area, month, summary: summarizeLpg(month.rows) };
  }, [area, data]);
}

export function LpgSection({ place, spot, places }: { place: Place; spot: Spot; places: PlacesFile }) {
  const lpg = useLpg(place, spot, places);
  const [open, setOpen] = useState(false);
  const monthly = useJson<LpgMonthly>(place.region === NCR ? 'lpg/ncr-monthly.json' : null);
  if (!lpg) return null;
  const { area, month, summary } = lpg;
  const name = placeName(area.place, places);
  return (
    <View>
      <SectionTitle>Cooking gas (LPG) · {periodLabel(month.start.slice(0, 7))}</SectionTitle>
      <Card>
        <PriceRow
          title="LPG, 11 kg tank"
          subtitle={[
            summary.lo != null && summary.hi != null && summary.lo !== summary.hi ? `${peso(summary.lo)}–${summary.hi.toFixed(2)} by brand` : null,
            area.km > 0 ? `${name}, ${area.km.toFixed(0)} km away` : null,
          ].filter(Boolean).join(' · ') || undefined}
          price={summary.main}
          unit="tank"
          last={null}
          prev={null}
          onPress={() => setOpen(true)}
        />
      </Card>
      <Sheet open={open} onClose={() => setOpen(false)} title="LPG, 11 kg tank">
        <Text style={s.caption}>{name} · DOE monthly monitoring, {periodLabel(month.start.slice(0, 7))}</Text>
        <Text style={[s.h3, { marginTop: 14 }]}>By brand · lowest to highest</Text>
        {summary.brands.map((b) => (
          <View key={b.brand} style={s.brandRow}>
            <Text style={s.brand}>{b.brand}</Text>
            <Text style={s.brandPrice}>{pesoPrice(b.p)}</Text>
          </View>
        ))}
        {monthly.data ? (
          <View style={{ marginTop: 20 }}>
            <Text style={s.h3}>Metro Manila, 2026 (middle of DOE's price range)</Text>
            <Chart periods={monthly.data.periods} values={monthly.data.s.map((r) => (r[0] + r[1]) / 2)} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------- trip cost

export function TripCost({ pricePerLiter }: { pricePerLiter: number }) {
  const { prefs } = usePrefs();
  const [km, setKm] = useState('20');
  const [kmpl, setKmpl] = useState(String(prefs.kmpl)); // Settings → Fuel → mileage
  const d = parseFloat(km);
  const e = parseFloat(kmpl);
  const cost = d > 0 && e > 0 ? (d / e) * pricePerLiter : null;
  return (
    <View style={s.trip}>
      <Text style={s.h3}>Trip cost</Text>
      <View style={s.tripRow}>
        <Field label="Distance (km)" value={km} onChange={setKm} />
        <Field label="Mileage (km/L)" value={kmpl} onChange={setKmpl} />
      </View>
      <Text style={s.tripResult}>{cost != null ? `≈ ${peso(cost)}` : '—'}</Text>
      <Text style={s.caption}>At {peso(pricePerLiter)}/L. Mileage: ~10–14 km/L for a small car, 30–40 for a motorcycle.</Text>
    </View>
  );
}

function Field({ label, value: v, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput value={v} onChangeText={onChange} keyboardType="decimal-pad" style={s.input}
        accessibilityLabel={label} selectTextOnFocus />
    </View>
  );
}

export { Notice };

const s = themed(() => ({
  banner: {
    backgroundColor: C.card, borderRadius: R.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line,
    marginHorizontal: 16, marginBottom: 12, padding: 14,
  },
  bannerTitle: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  bannerRow: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  adj: { minWidth: 90 },
  adjLabel: { fontSize: 13, color: C.muted },
  adjValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bannerNote: { fontSize: 12, color: C.faint, marginTop: 6 },
  caption: { color: C.muted, fontSize: 13, marginTop: 2 },
  h3: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 6 },
  brandRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  brand: { fontSize: 14, color: C.text },
  brandPrice: { fontSize: 14, fontWeight: '600', color: C.text, fontVariant: ['tabular-nums'] },
  trip: { marginTop: 20, padding: 14, backgroundColor: C.bg, borderRadius: R.lg },
  tripRow: { flexDirection: 'row', gap: 10 },
  tripResult: { fontSize: 24, fontWeight: '800', color: C.text, marginTop: 10, fontVariant: ['tabular-nums'] },
  fieldLabel: { fontSize: 12, color: C.muted, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 16, color: C.text, backgroundColor: C.card,
  },
}));
