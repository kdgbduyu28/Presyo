import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FuelFile, Market, SummaryFile, SummaryItem, useJson } from '../lib/data';
import { peso, periodLabel, value } from '../lib/format';
import type { Spot } from '../lib/location';
import { placeName } from '../lib/names';
import { foodSource, fuelArea, Place, PlacesFile } from '../lib/places';
import { SEEN_KEY, useStored } from '../lib/stored';
import { usePrefs } from '../lib/prefs';
import { useWatch } from '../lib/watch';
import { C, TAB_LABELS, themed } from '../theme';
import { Card, Columns, Loading, Notice, PriceRow, SectionTitle } from './bits';
import { AdjustmentBanner, useLatestAdjustment, useLpg } from './FuelExtras';
import { Search } from './Search';

const GROUPS = ['rice', 'meat', 'seafood', 'vegetables', 'fruits', 'pantry'] as const;

/** The home tab: headline prices for where you are, in one screen. */
export function TodayView({ place, spot, places, markets, onOpenTab, wide }: {
  place: Place; spot: Spot; places: PlacesFile; markets: Market[]; onOpenTab: (tab: string) => void; wide?: boolean;
}) {
  const { prefs } = usePrefs();
  const source = foodSource(place, places.psa);
  const scope = source?.kind === 'da' ? 'ncr' : source?.code ?? null;
  const summary = useJson<SummaryFile>(scope ? `summary/${scope}.json` : null);
  const watch = useWatch();
  const adjustment = useLatestAdjustment();
  const fuel = useFuelHeadline(place, spot, places, prefs.fuel);
  const lpg = useLpg(place, spot, places);
  const sinceLast = useSinceLastVisit(scope, summary.data?.items);

  const items = summary.data?.items ?? [];
  const mine = items.filter((it) => watch.has(it.key));
  const where = source?.kind === 'da'
    ? 'Metro Manila average (DA, daily)'
    : source ? `${source.level === 'city' ? placeName(place, places, { short: true }) : places.names[source.code]} average (PSA, monthly)` : '';

  const row = (it: SummaryItem) => {
    const delta = sinceLast[it.key];
    return (
      <PriceRow
        key={it.key}
        title={it.item}
        subtitle={[
          it.origin === 'imported' ? 'Imported' : null,
          delta ? `${delta > 0 ? '▲' : '▼'} ${peso(Math.abs(delta))} since your last visit` : null,
        ].filter(Boolean).join(' · ') || undefined}
        starred={watch.has(it.key)}
        price={it.last}
        unit={it.unit}
        last={value(it.last)}
        prev={value(it.prev ?? null)}
        spark={it.spark.map(value)}
        onPress={() => onOpenTab(it.cat)}
      />
    );
  };

  // Settings → LPG brand: that brand's price when DOE lists it here.
  const lpgBrand = lpg && prefs.lpgBrand ? lpg.summary.brands.find((b) => b.brand === prefs.lpgBrand) : undefined;

  const left = (
    <>
      <Search source={source} spot={spot} markets={markets} />
      {adjustment ? <AdjustmentBanner week={adjustment} /> : null}

      {fuel || lpg ? (
        <>
          <SectionTitle>Fuel & cooking gas</SectionTitle>
          <Card>
            {fuel?.rows.map((f) => (
              <PriceRow key={f.key} title={f.label} subtitle={fuel.where} price={f.price} unit="L"
                last={f.price} prev={f.prev} onPress={() => onOpenTab('fuel')} />
            ))}
            {lpg ? (
              <PriceRow
                title={lpgBrand ? `LPG, 11 kg · ${lpgBrand.brand}` : 'LPG, 11 kg tank'}
                subtitle={`${placeName(lpg.area.place, places, { short: true })} · ${periodLabel(lpg.month.start.slice(0, 7))}`}
                price={lpgBrand ? lpgBrand.p : lpg.summary.main} unit="tank" last={null} prev={null}
                onPress={() => onOpenTab('fuel')} />
            ) : null}
          </Card>
        </>
      ) : null}

      {mine.length ? (
        <>
          <SectionTitle>My items</SectionTitle>
          <Card>{mine.map(row)}</Card>
        </>
      ) : items.length ? (
        <Notice>Tip: open any item and tap “☆ Add to my items” to pin it here.</Notice>
      ) : null}
    </>
  );

  const right = summary.loading ? <Loading /> : !items.length ? (
    <Notice tone="warn">No food price data covers {placeName(place, places)} yet.</Notice>
  ) : (
    <>
      {GROUPS.map((g) => {
        const list = items.filter((it) => it.cat === g && !watch.has(it.key));
        if (!list.length) return null;
        return (
          <View key={g}>
            <SectionTitle>{TAB_LABELS[g]}</SectionTitle>
            <Card>{list.map(row)}</Card>
          </View>
        );
      })}
      <Text style={s.source}>
        {where} · latest {periodLabel(items[0].period)}. Tap an item for the full list.
      </Text>
    </>
  );

  return <Columns wide={wide} left={left} right={right} />;
}

const FUEL_LABEL: Record<string, string> = {
  fuel_ron91: 'Gasoline RON 91', fuel_ron95: 'Gasoline RON 95', fuel_ron97: 'Gasoline RON 97',
  fuel_ron100: 'Gasoline RON 100', fuel_diesel: 'Diesel', fuel_diesel_plus: 'Diesel Plus',
};

/** Your fuel (Settings) plus RON 91 / diesel: common price in the nearest DOE-monitored area. */
function useFuelHeadline(place: Place, spot: Spot, places: PlacesFile, preferred: string) {
  const area = useMemo(() => fuelArea(places.rows, place, spot.lat, spot.lng), [places, place, spot]);
  const { data } = useJson<FuelFile>(area ? `fuel/${area.place.code}.json` : null);
  return useMemo(() => {
    if (!area || !data?.weeks.length) return null;
    const weeks = data.weeks;
    const pick = (w: FuelFile['weeks'][number] | undefined, key: string) =>
      value(w?.rows.find((r) => r.key === key && !r.brand)?.p ?? null);
    const latest = weeks[weeks.length - 1];
    const prev = weeks[weeks.length - 2];
    const keys = [preferred, ...['fuel_ron91', 'fuel_diesel'].filter((k) => k !== preferred)].slice(0, 2);
    const rows = keys
      .map((key) => ({ key, label: FUEL_LABEL[key] ?? key, price: pick(latest, key), prev: pick(prev, key) }))
      .filter((r) => r.price != null);
    const where = `${placeName(area.place, places, { short: true })}${area.km > 0 ? ` (${area.km.toFixed(0)} km)` : ''}`;
    return rows.length ? { rows, where } : null;
  }, [area, data, places, preferred]);
}

/** Price change per key since the previous visit (stored on the device). */
function useSinceLastVisit(scope: string | null, items?: SummaryItem[]) {
  const [seen, setSeen, ready] = useStored<Record<string, number>>(SEEN_KEY, {});
  const [baseline, setBaseline] = useState<Record<string, number> | null>(null);
  const saved = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !scope || !items?.length || saved.current === scope) return;
    saved.current = scope;
    setBaseline(seen);
    const next = { ...seen };
    for (const it of items) {
      const v = value(it.last);
      if (v != null) next[`${scope}:${it.key}`] = v;
    }
    setSeen(next);
  }, [ready, scope, items, seen, setSeen]);

  return useMemo(() => {
    const out: Record<string, number> = {};
    if (!baseline || !scope || !items) return out;
    for (const it of items) {
      const before = baseline[`${scope}:${it.key}`];
      const now = value(it.last);
      if (before != null && now != null && Math.abs(now - before) >= 0.01) out[it.key] = now - before;
    }
    return out;
  }, [baseline, scope, items]);
}

const s = themed(() => ({
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24 },
}));
