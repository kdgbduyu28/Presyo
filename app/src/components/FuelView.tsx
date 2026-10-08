import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FuelFile, FuelRow, useJson } from '../lib/data';
import { daysAgo, peso, pesoPrice, rangeLabel, value } from '../lib/format';
import type { Spot } from '../lib/location';
import { placeName } from '../lib/names';
import { fuelArea, Place, PlacesFile } from '../lib/places';
import { C, themed } from '../theme';
import { Chart } from './Chart';
import { Card, Columns, Delta, Loading, Notice, PriceRow, SectionTitle } from './bits';
import { AdjustmentBanner, LpgSection, TripCost, useLatestAdjustment } from './FuelExtras';
import { Sheet } from './Sheet';

const PRODUCTS: [key: string, label: string, hint: string][] = [
  ['fuel_ron91', 'Gasoline RON 91', 'Regular unleaded'],
  ['fuel_ron95', 'Gasoline RON 95', 'Premium'],
  ['fuel_diesel', 'Diesel', ''],
  ['fuel_ron97', 'Gasoline RON 97', 'Super premium'],
  ['fuel_ron100', 'Gasoline RON 100', ''],
  ['fuel_diesel_plus', 'Diesel Plus', 'Premium diesel'],
  ['fuel_kerosene', 'Kerosene', 'Gaas'],
];

type Summary = {
  key: string;
  label: string;
  hint: string;
  /** DOE's "common price" for the week, or the middle of the brand ranges. */
  main: number | null;
  lo: number | null;
  hi: number | null;
  brands: FuelRow[];
};

function summarize(rows: FuelRow[], key: string, label: string, hint: string): Summary | null {
  const mine = rows.filter((r) => r.key === key);
  if (!mine.length) return null;
  const brands = mine.filter((r) => r.brand).sort((a, b) => (value(a.p) ?? 0) - (value(b.p) ?? 0));
  const common = mine.find((r) => !r.brand);
  const lows = brands.map((b) => (typeof b.p === 'number' ? b.p : b.p?.[0])).filter((v): v is number => v != null);
  const highs = brands.map((b) => (typeof b.p === 'number' ? b.p : b.p?.[1])).filter((v): v is number => v != null);
  const mids = brands.map((b) => value(b.p)).filter((v): v is number => v != null).sort((a, b) => a - b);
  const main = value(common?.p ?? null) ?? (mids.length ? mids[Math.floor(mids.length / 2)] : null);
  return {
    key, label, hint, main, brands,
    lo: lows.length ? Math.min(...lows) : null,
    hi: highs.length ? Math.max(...highs) : null,
  };
}

export function FuelView({ place, spot, places, wide }: { place: Place; spot: Spot; places: PlacesFile; wide?: boolean }) {
  const area = useMemo(() => fuelArea(places.rows, place, spot.lat, spot.lng), [places, place, spot]);
  const { data, loading, error } = useJson<FuelFile>(area ? `fuel/${area.place.code}.json` : null);
  const [open, setOpen] = useState<string | null>(null);
  const adjustment = useLatestAdjustment();

  if (!area) return <Notice tone="warn">No DOE fuel monitoring near you yet.</Notice>;
  if (loading) return <Loading />;
  if (error || !data?.weeks.length) return <Notice tone="warn">Couldn't load fuel prices ({error}).</Notice>;

  const weeks = data.weeks;
  const latest = weeks[weeks.length - 1];
  const previous = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const summaries = PRODUCTS.map(([k, l, h]) => summarize(latest.rows, k, l, h)).filter((x): x is Summary => x != null);
  const prevMain = (key: string) => (previous ? summarize(previous.rows, key, '', '')?.main ?? null : null);
  const stale = daysAgo(latest.end) > 10;
  const name = placeName(area.place, places);
  const sel = summaries.find((x) => x.key === open);

  const left = (
    <>
      {adjustment ? <AdjustmentBanner week={adjustment} /> : null}
      {area.km > 0 ? (
        <Notice>
          DOE doesn't monitor pump prices in {placeName(place, places, { short: true })}. Showing {name},
          the nearest monitored area ({area.km.toFixed(area.km < 10 ? 1 : 0)} km away).
        </Notice>
      ) : null}
      {stale ? (
        <Notice tone="warn">
          The latest DOE report for this area is for {rangeLabel(latest.start, latest.end)}. Newer weeks
          weren't readable (scanned PDFs), so these may be out of date.
        </Notice>
      ) : null}
      <SectionTitle>Week of {rangeLabel(latest.start, latest.end)}</SectionTitle>
      <Card>
        {summaries.map((x) => (
          <PriceRow
            key={x.key}
            title={x.label}
            subtitle={[x.hint, x.lo != null && x.hi != null && x.lo !== x.hi ? `${peso(x.lo)}–${x.hi.toFixed(2)} across stations` : null]
              .filter(Boolean).join(' · ') || undefined}
            price={x.main}
            unit="L"
            last={x.main}
            prev={prevMain(x.key)}
            spark={weeks.map((w) => summarize(w.rows, x.key, '', '')?.main ?? null)}
            onPress={() => setOpen(x.key)}
          />
        ))}
      </Card>
      <Text style={s.source}>
        {name} · DOE weekly retail pump price monitoring. Prices change every Tuesday.
      </Text>
    </>
  );

  return (
    <>
      <Columns wide={wide} left={left} right={<LpgSection place={place} spot={spot} places={places} />} />

      <Sheet open={sel != null} onClose={() => setOpen(null)} title={sel?.label}>
        {sel ? (
          <View>
            <View style={s.big}>
              <Text style={s.bigPrice}>{sel.main != null ? peso(sel.main) : '—'}<Text style={s.bigUnit}>/L</Text></Text>
              <Delta last={sel.main} prev={prevMain(sel.key)} />
            </View>
            <Text style={s.caption}>Common price in {name} · vs previous week</Text>
            <View style={{ marginTop: 16 }}>
              <Chart periods={weeks.map((w) => w.start)} values={weeks.map((w) => summarize(w.rows, sel.key, '', '')?.main ?? null)} />
            </View>
            <Text style={[s.h3, { marginTop: 20 }]}>By brand · lowest to highest</Text>
            {sel.brands.map((b) => (
              <View key={b.brand} style={s.brandRow}>
                <Text style={s.brand}>{b.brand}</Text>
                <Text style={s.brandPrice}>{pesoPrice(b.p)}</Text>
              </View>
            ))}
            <Text style={[s.caption, { marginTop: 8 }]}>
              Ranges are the lowest and highest pump price DOE saw at that brand's stations in the area.
            </Text>
            {sel.main != null && sel.key !== 'fuel_kerosene' ? <TripCost pricePerLiter={sel.main} /> : null}
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const s = themed(() => ({
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24 },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  bigPrice: { fontSize: 30, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  bigUnit: { fontSize: 15, fontWeight: '400', color: C.muted },
  caption: { color: C.muted, fontSize: 13, marginTop: 2 },
  h3: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 6 },
  brandRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  brand: { fontSize: 14, color: C.text },
  brandPrice: { fontSize: 14, fontWeight: '600', color: C.text, fontVariant: ['tabular-nums'] },
}));
