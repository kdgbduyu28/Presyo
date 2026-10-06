import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LatestFile, SeriesFile, SeriesItem, useJson } from '../lib/data';
import { lastTwo, peso, pesoPrice, periodLabel, Price, UNIT_LABEL, value } from '../lib/format';
import { activeMarkets, foodSource, km, Market, nearestMarkets, Place, PlacesFile } from '../lib/places';
import type { Spot } from '../lib/location';
import { placeName, shortName } from '../lib/names';
import { useWatch } from '../lib/watch';
import { C } from '../theme';
import { Chart } from './Chart';
import { Card, Chips, Delta, Loading, Notice, PriceRow, SectionTitle, ShareButton, StarButton } from './bits';
import { Sheet } from './Sheet';

const RECENT = 30; // periods shown in row sparklines

export function FoodView({ cat, place, spot, places, markets }: {
  cat: string; place: Place; spot: Spot; places: PlacesFile; markets: Market[];
}) {
  const source = foodSource(place, places.psa);
  if (!source) {
    return <Notice tone="warn">No food price data covers {placeName(place, places)} yet.</Notice>;
  }
  if (source.kind === 'da') return <DaView cat={cat} spot={spot} markets={markets} places={places} />;
  return <PsaView cat={cat} code={source.code} level={source.level} places={places} place={place} />;
}

// ---------------------------------------------------------------- Metro Manila

function DaView({ cat, spot, markets, places }: { cat: string; spot: Spot; markets: Market[]; places: PlacesFile }) {
  const near = useMemo(() => nearestMarkets(activeMarkets(markets), spot.lat, spot.lng, 3), [markets, spot]);
  const [scope, setScope] = useState<string>(near[0]?.market.id ?? 'ncr');
  const path = scope === 'ncr' ? `da/index-${cat}.json` : `da/m/${scope}.json`;
  const { data, loading, error } = useJson<SeriesFile>(path);
  const market = markets.find((m) => m.id === scope);

  const options = [
    ...near.map(({ market: m, km: d }) => ({
      id: m.id,
      label: m.name.split('/')[0],
      hint: m.approx ? `in ${cityOf(m, places)}` : `${d < 10 ? d.toFixed(1) : Math.round(d)} km away`,
    })),
    { id: 'ncr', label: 'Metro Manila average', hint: 'all items · 34 markets' },
  ];

  return (
    <View>
      <Chips options={options} value={scope} onChange={setScope} />
      {loading ? <Loading /> : error ? <Notice tone="warn">Couldn't load prices ({error}).</Notice> : data ? (
        <ItemList
          file={data}
          cat={cat}
          sourceLine={scope === 'ncr'
            ? 'Prevailing price across NCR wet markets · DA Bantay Presyo'
            : `${market?.name.split('/')[0]} · DA Bantay Presyo daily monitoring`}
          cadence="day"
          emptyHint={scope === 'ncr' ? undefined : 'DA tracks fewer items per market. Try “Metro Manila average” for the full list.'}
          compare={scope === 'ncr' ? undefined : { spot, markets }}
        />
      ) : null}
    </View>
  );
}

function cityOf(m: Market, places: PlacesFile): string {
  const row = places.rows.find((r) => r[0] === m.area);
  return row ? shortName(row[1]) : 'Metro Manila';
}

// ---------------------------------------------------------------- elsewhere

function PsaView({ cat, code, level, places, place }: {
  cat: string; code: string; level: 'city' | 'province' | 'region'; places: PlacesFile; place: Place;
}) {
  const { data, loading, error } = useJson<SeriesFile>(`psa/${code}.json`);
  const area = level === 'city' ? placeName(place, places, { short: true }) : places.names[code] ?? code;
  const what = level === 'city' ? 'city' : level === 'province' ? 'province' : 'region';
  if (loading) return <Loading />;
  if (error || !data) return <Notice tone="warn">Couldn't load prices ({error}).</Notice>;
  return (
    <View>
      <Notice>
        Average retail prices for {area} {what} from the Philippine Statistics Authority. They're
        published monthly, about a month late. Prices at your own palengke may differ.
      </Notice>
      <ItemList file={data} cat={cat} sourceLine={`${area} ${what} average · PSA`} cadence="month" />
    </View>
  );
}

// ---------------------------------------------------------------- list + detail

function ItemList({ file, cat, sourceLine, cadence, emptyHint, compare }: {
  file: SeriesFile;
  cat: string;
  sourceLine: string;
  cadence: 'day' | 'month';
  emptyHint?: string;
  compare?: { spot: Spot; markets: Market[] };
}) {
  const [open, setOpen] = useState<SeriesItem | null>(null);
  const watch = useWatch();
  const items = useMemo(() => {
    const recent = Math.max(0, file.periods.length - (cadence === 'day' ? 14 : 3));
    return file.items
      .filter((it) => it.cat === cat && it.s.slice(recent).some((v) => v != null))
      .sort((a, b) => Number(!a.key) - Number(!b.key) || a.item.localeCompare(b.item));
  }, [file, cat, cadence]);

  const latestIdx = Math.max(-1, ...items.map((it) => lastTwo(it.s).lastIdx));
  const asOf = latestIdx >= 0 ? file.periods[latestIdx] : null;

  if (!items.length) {
    return <Notice>{emptyHint ?? 'No prices reported for this category recently.'}</Notice>;
  }
  return (
    <View>
      <SectionTitle>{asOf ? `${cadence === 'day' ? 'As of' : 'For'} ${periodLabel(asOf)}` : ''}</SectionTitle>
      <Card>
        {items.map((it) => {
          const { last, prev, lastIdx } = lastTwo(it.s);
          return (
            <PriceRow
              key={`${it.item}|${it.spec}|${it.origin}`}
              title={it.item}
              subtitle={[it.spec, lastIdx !== latestIdx && lastIdx >= 0 ? `as of ${periodLabel(file.periods[lastIdx])}` : null]
                .filter(Boolean).join(' · ') || undefined}
              badge={it.origin === 'imported' ? 'Imported' : it.origin === 'local' ? 'Local' : undefined}
              starred={watch.has(it.key)}
              price={it.s[lastIdx] ?? null}
              unit={it.unit}
              last={last}
              prev={prev}
              spark={it.s.slice(-RECENT).map(value)}
              onPress={() => setOpen(it)}
            />
          );
        })}
      </Card>
      <Text style={s.source}>{sourceLine}</Text>
      <Sheet open={open != null} onClose={() => setOpen(null)} title={open ? titleOf(open) : ''}>
        {open ? <ItemDetail item={open} periods={file.periods} cadence={cadence} compare={compare} /> : null}
      </Sheet>
    </View>
  );
}

export function titleOf(it: SeriesItem) {
  const origin = it.origin === 'imported' ? ' (imported)' : it.origin === 'local' ? ' (local)' : '';
  return `${it.item}${origin}`;
}

const RANGES = [
  { id: '1M', label: '1M', days: 31 },
  { id: '3M', label: '3M', days: 92 },
  { id: 'all', label: '2026', days: 0 },
] as const;

export function ItemDetail({ item, periods, cadence, compare }: {
  item: SeriesItem; periods: string[]; cadence: 'day' | 'month'; compare?: { spot: Spot; markets: Market[] };
}) {
  const { last, prev, lastIdx } = lastTwo(item.s);
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>(cadence === 'day' ? '3M' : 'all');
  const from = useMemo(() => {
    const r = RANGES.find((x) => x.id === range)!;
    if (!r.days || lastIdx < 0) return 0;
    const cutoff = new Date(new Date(`${periods[lastIdx]}T00:00:00Z`).getTime() - r.days * 86_400_000)
      .toISOString().slice(0, 10);
    const i = periods.findIndex((p) => p >= cutoff);
    return i < 0 ? 0 : i;
  }, [range, periods, lastIdx]);
  const values = item.s.map(value);
  const egg = item.unit === 'pc' && /egg/i.test(item.item) && last != null;
  return (
    <View>
      <View style={s.detailHead}>
        <View style={{ flex: 1 }}>
          {item.spec ? <Text style={s.spec}>{item.spec}</Text> : null}
          <View style={s.big}>
            <Text style={s.bigPrice}>{pesoPrice(item.s[lastIdx] ?? null)}<Text style={s.bigUnit}>{UNIT_LABEL[item.unit]}</Text></Text>
            <Delta last={last} prev={prev} />
          </View>
          {egg ? <Text style={s.tray}>≈ {peso((last as number) * 30)} per tray of 30</Text> : null}
          <Text style={s.caption}>
            {lastIdx >= 0 ? `${periodLabel(periods[lastIdx])} · change vs previous ${cadence === 'day' ? 'report' : 'month'}` : ''}
          </Text>
        </View>
        <StarButton itemKey={item.key} />
      </View>
      {cadence === 'day' ? (
        <View style={s.ranges}>
          {RANGES.map((r) => (
            <Pressable key={r.id} onPress={() => setRange(r.id)} style={[s.range, range === r.id && s.rangeOn]}
              accessibilityRole="button" accessibilityState={{ selected: range === r.id }}>
              <Text style={[s.rangeText, range === r.id && s.rangeTextOn]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={{ marginTop: 12 }}>
        <Chart periods={periods.slice(from)} values={values.slice(from)} />
      </View>
      {compare && item.key ? <NearbyMarkets item={item} {...compare} /> : null}
      <ShareButton text={`${titleOf(item)}: ${pesoPrice(item.s[lastIdx] ?? null)}${UNIT_LABEL[item.unit] ?? ''}`
        + (lastIdx >= 0 ? ` (${periodLabel(periods[lastIdx])})` : '') + ' — via Presyo'} />
    </View>
  );
}

/** Same item at the other DA markets on the latest report, cheapest first. */
function NearbyMarkets({ item, spot, markets }: { item: SeriesItem; spot: Spot; markets: Market[] }) {
  const { data } = useJson<LatestFile>('da/latest.json');
  if (!data) return null;
  const match = data.items.find((x) => x.item === item.item && x.origin === item.origin && x.unit === item.unit);
  if (!match) return null;
  const byId = new Map(markets.map((m) => [m.id, m]));
  const rows = Object.entries(match.m)
    .map(([id, p]) => ({ m: byId.get(id), p: p as Price }))
    .filter((r): r is { m: Market; p: Price } => r.m != null && value(r.p) != null)
    .map((r) => ({ ...r, d: km(spot.lat, spot.lng, r.m.lat, r.m.lng) }))
    .filter((r) => r.d <= 8)
    .sort((a, b) => (value(a.p) as number) - (value(b.p) as number));
  if (rows.length < 2) return null;
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={s.h3}>Within 8 km · {periodLabel(data.date)}</Text>
      {rows.map((r, i) => (
        <View key={r.m.id} style={s.cmpRow}>
          <Text style={[s.cmpName, i === 0 && { color: C.down, fontWeight: '700' }]} numberOfLines={1}>
            {r.m.name.split('/')[0]}
          </Text>
          <Text style={s.cmpKm}>{r.m.approx ? 'approx.' : `${r.d.toFixed(1)} km`}</Text>
          <Text style={[s.cmpPrice, i === 0 && { color: C.down }]}>{pesoPrice(r.p)}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24 },
  spec: { color: C.muted, fontSize: 14, marginBottom: 8 },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tray: { color: C.text, fontSize: 14, marginTop: 2 },
  ranges: { flexDirection: 'row', gap: 6, marginTop: 14 },
  range: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.line },
  rangeOn: { backgroundColor: C.text, borderColor: C.text },
  rangeText: { fontSize: 13, fontWeight: '600', color: C.muted },
  rangeTextOn: { color: '#fff' },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  bigPrice: { fontSize: 30, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  bigUnit: { fontSize: 15, fontWeight: '400', color: C.muted },
  caption: { color: C.muted, fontSize: 13, marginTop: 2 },
  h3: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 6 },
  cmpRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  cmpName: { flex: 1, color: C.text, fontSize: 14 },
  cmpKm: { color: C.faint, fontSize: 12, width: 56, textAlign: 'right' },
  cmpPrice: { color: C.text, fontSize: 14, fontWeight: '600', width: 120, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
