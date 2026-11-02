import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BASKET_ITEMS, BasketLine, basketFromAverages, basketHistory, basketTotals, OriginPref } from '../lib/basket';
import { LatestFile, Market, SeriesFile, SummaryFile, useJson } from '../lib/data';
import { peso, periodLabel, value } from '../lib/format';
import type { Spot } from '../lib/location';
import { placeName } from '../lib/names';
import { activeMarkets, foodSource, Place, PlacesFile } from '../lib/places';
import { usePrefs } from '../lib/prefs';
import { BASKET_KEY, useStored } from '../lib/stored';
import { t } from '../i18n';
import { itemName } from '../i18n/items';
import { C, R, themed } from '../theme';
import { Card, Columns, Loading, Notice, SectionTitle } from './bits';

const STARTER: BasketLine[] = [
  { key: 'rice_well_milled', qty: 5 },
  { key: 'egg_medium', qty: 30 },
  { key: 'pork_liempo', qty: 1 },
  { key: 'chicken_whole', qty: 1 },
  { key: 'galunggong', qty: 1 },
  { key: 'tomato', qty: 0.5 },
  { key: 'onion_red', qty: 0.25 },
];

const byKey = new Map(BASKET_ITEMS.map((b) => [b.key, b]));

function qtyLabel(key: string, qty: number) {
  const it = byKey.get(key);
  if (!it) return String(qty);
  if (it.unit === 'pc') return `${qty} ${t('pcs')}${qty % 30 === 0 ? ` (${qty / 30} ${qty > 30 ? t('trays') : t('tray')})` : ''}`;
  return `${+qty.toFixed(2)} ${it.unit}`;
}

/** Your palengke list, priced at the markets near you. */
export function BasketView({ place, spot, places, markets, wide }: {
  place: Place; spot: Spot; places: PlacesFile; markets: Market[]; wide?: boolean;
}) {
  const { prefs } = usePrefs();
  const [lines, setLines, ready] = useStored<BasketLine[]>(BASKET_KEY, STARTER);
  const source = foodSource(place, places.psa);
  const latest = useJson<LatestFile>(source?.kind === 'da' ? 'da/latest.json' : null);
  const summary = useJson<SummaryFile>(source?.kind === 'psa' ? `summary/${source.code}.json` : null);

  const setQty = (key: string, qty: number) =>
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty } : l))));
  const add = (key: string) => setLines((ls) => [...ls, { key, qty: byKey.get(key)!.start }]);
  const available = BASKET_ITEMS.filter((b) => !lines.some((l) => l.key === b.key));

  const results = useMemo(() => {
    if (!latest.data || !lines.length) return null;
    return basketTotals(lines, latest.data.items, activeMarkets(markets), spot.lat, spot.lng, {
      maxKm: prefs.basketKm, origin: prefs.origin, favourites: prefs.favMarkets,
    }).slice(0, 8);
  }, [latest.data, lines, markets, spot, prefs.basketKm, prefs.origin, prefs.favMarkets]);

  const estimate = useMemo(() => {
    if (!summary.data) return null;
    const prices: Record<string, number> = {};
    for (const it of summary.data.items) {
      const v = value(it.last);
      if (v != null) prices[it.key] = v;
    }
    return { ...basketFromAverages(lines, prices), period: summary.data.items[0]?.period };
  }, [summary.data, lines]);

  if (!ready) return <Loading />;
  const label = (k: string) => itemName(byKey.get(k)?.label ?? k);

  const list = (
    <>
      <SectionTitle>{t('My palengke list')}</SectionTitle>
      <Card>
        {lines.map((l) => {
          const it = byKey.get(l.key);
          if (!it) return null;
          return (
            <View key={l.key} style={s.line}>
              <Text style={s.lineName} numberOfLines={1}>{label(l.key)}</Text>
              <Stepper onPress={() => setQty(l.key, +(l.qty - it.step).toFixed(2))} label="−" a11y={t('Less {item}', { item: label(l.key) })} />
              <Text style={s.qty}>{qtyLabel(l.key, l.qty)}</Text>
              <Stepper onPress={() => setQty(l.key, +(l.qty + it.step).toFixed(2))} label="+" a11y={t('More {item}', { item: label(l.key) })} />
            </View>
          );
        })}
        {!lines.length ? <Text style={s.empty}>{t('Your list is empty. Add items below.')}</Text> : null}
      </Card>
      {available.length ? (
        <View style={s.addWrap}>
          {available.map((b) => (
            <Pressable key={b.key} onPress={() => add(b.key)} style={s.add} accessibilityRole="button"
              accessibilityLabel={t('Add {item}', { item: label(b.key) })}>
              <Text style={s.addText}>+ {label(b.key)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <BasketHistory lines={lines} source={source} origin={prefs.origin} />
    </>
  );

  const priced = (
    <>
      {source?.kind === 'da' ? (
        latest.loading ? <Loading /> : results && results.length ? (
          <>
            <SectionTitle>{t('Cost at markets within {km} km', { km: prefs.basketKm })}{prefs.favMarkets.length ? ` + ${t('favourites')}` : ''} · {latest.data ? periodLabel(latest.data.date) : ''}</SectionTitle>
            <Card>
              {results.map((r, i) => {
                const cheapest = i === 0 && !r.missing.length;
                return (
                  <View key={r.market.id} style={s.result}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.resultName, cheapest && { color: C.down }]} numberOfLines={1}>
                        {cheapest ? '✓ ' : ''}{r.market.name.split('/')[0]}
                      </Text>
                      <Text style={s.resultSub}>
                        {r.market.approx ? t('location approx.') : `${r.km.toFixed(1)} km`}
                        {r.missing.length ? ` · ${t('no price for {items}', { items: r.missing.map(label).join(', ') })}` : ''}
                      </Text>
                    </View>
                    <Text style={[s.total, cheapest && { color: C.down }]}>{peso(r.total)}</Text>
                  </View>
                );
              })}
            </Card>
            <Savings results={results} />
          </>
        ) : lines.length ? <Notice>{t('No DA-monitored market within {km} km reports these items. Raise the distance or add favourite markets in Settings.', { km: prefs.basketKm })}</Notice> : null
      ) : estimate ? (
        <>
          <SectionTitle>{t('Estimated cost')}</SectionTitle>
          <Card style={{ padding: 16 }}>
            <Text style={s.bigTotal}>{peso(estimate.total)}</Text>
            <Text style={s.resultSub}>
              {t('At {area} average prices', { area: source?.kind === 'psa' && source.level !== 'city' ? places.names[source.code] : placeName(place, places, { short: true }) })}
              {' '}(PSA{estimate.period ? `, ${periodLabel(estimate.period)}` : ''}).
              {estimate.missing.length ? ` ${t('Not included: {items}.', { items: estimate.missing.map(label).join(', ') })}` : ''}
            </Text>
          </Card>
          <Notice>{t('Per-market prices are only monitored in Metro Manila for now.')}</Notice>
        </>
      ) : null}
    </>
  );

  return <Columns wide={wide} left={list} right={priced} />;
}

const DA_CATS = ['rice', 'meat', 'seafood', 'vegetables', 'fruits', 'pantry'] as const;

/** What the list cost each week (Metro Manila, DA daily averages) or month (PSA elsewhere). */
function BasketHistory({ lines, source, origin }: {
  lines: BasketLine[]; source: ReturnType<typeof foodSource>; origin: OriginPref;
}) {
  const da = source?.kind === 'da';
  const cats = new Set(lines.map((l) => byKey.get(l.key)?.cat));
  // fixed hook count: one per DA category, null when the list doesn't need it
  const files = [
    ...DA_CATS.map((c) => useJson<SeriesFile>(da && cats.has(c) ? `da/index-${c}.json` : null)),
    useJson<SeriesFile>(source?.kind === 'psa' ? `psa/${source.code}.json` : null),
  ];
  const loading = files.some((f) => f.loading);
  const points = useMemo(() => {
    const loaded = files.filter((f) => f.data).map((f) => f.data!);
    if (loading || !loaded.length || !lines.length) return [];
    // the DA category files share one daily calendar; merge them onto it
    const periods = [...new Set(loaded.flatMap((f) => f.periods))].sort();
    const items = loaded.flatMap((f) => {
      const at = f.periods.map((p) => periods.indexOf(p));
      return f.items.map((it) => {
        const s = new Array(periods.length).fill(null);
        it.s.forEach((v, i) => (s[at[i]] = v));
        return { key: it.key, origin: it.origin, s };
      });
    });
    return basketHistory(lines, items, periods, { origin, by: da ? 'week' : 'month', count: da ? 12 : 9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lines, origin, da, ...files.map((f) => f.data)]);

  if (loading) return <Loading />;
  if (points.length < 2) return null;
  const totals = points.map((p) => p.total);
  const lo = Math.min(...totals) * 0.95;
  const hi = Math.max(...totals);
  const last = points[points.length - 1];
  const back = points[Math.max(0, points.length - 5)];
  const diff = last.total - back.total;
  const missing = [...new Set(points.flatMap((p) => p.missing))];
  const vars = {
    amount: peso(Math.abs(diff)),
    when: da ? t('{n} weeks ago', { n: points.length - 1 - points.indexOf(back) }) : periodLabel(back.period),
  };
  return (
    <>
      <SectionTitle>{da ? t('What your list cost each week') : t('What your list cost each month')}</SectionTitle>
      <Card style={{ paddingVertical: 8 }}>
        {points.map((p, i) => (
          <View key={p.period} style={s.hist}>
            <Text style={s.histLabel}>{da ? periodLabel(p.period) : periodLabel(p.period).replace(/ \d{4}$/, '')}</Text>
            <View style={s.barTrack}>
              <View style={[s.bar, { width: `${Math.max(4, ((p.total - lo) / (hi - lo || 1)) * 100)}%` },
                i === points.length - 1 && { backgroundColor: C.primary }]} />
            </View>
            <Text style={s.histTotal}>{peso(p.total)}</Text>
          </View>
        ))}
      </Card>
      <Text style={s.histNote}>
        {Math.abs(diff) < 1 ? t('About the same as {when}', vars)
          : diff > 0 ? t('{amount} more than {when}', vars) : t('{amount} less than {when}', vars)}
        {' · '}
        {da ? t('Metro Manila average prices (DA), last report of each week.') : t('Average prices (PSA), by month.')}
        {missing.length ? ` ${t('Not included: {items}.', { items: missing.map((k) => itemName(byKey.get(k)?.label ?? k)).join(', ') })}` : ''}
      </Text>
    </>
  );
}

function Savings({ results }: { results: { total: number; missing: string[] }[] }) {
  const complete = results.filter((r) => !r.missing.length);
  if (complete.length < 2) return null;
  const diff = complete[complete.length - 1].total - complete[0].total;
  if (diff < 1) return null;
  return <Notice>{t('Buying at the cheapest market saves about {amount} vs. the dearest one listed.', { amount: peso(diff) })}</Notice>;
}

function Stepper({ onPress, label, a11y }: { onPress: () => void; label: string; a11y: string }) {
  return (
    <Pressable onPress={onPress} style={s.step} hitSlop={6} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={s.stepText}>{label}</Text>
    </Pressable>
  );
}

const s = themed(() => ({
  line: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  lineName: { flex: 1, fontSize: 15, color: C.text, fontWeight: '600' },
  qty: { minWidth: 92, textAlign: 'center', fontSize: 14, color: C.text, fontVariant: ['tabular-nums'] },
  step: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg,
  },
  stepText: { fontSize: 18, color: C.text, fontWeight: '600', marginTop: -2 },
  empty: { padding: 16, color: C.muted },
  addWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginBottom: 16 },
  add: { borderRadius: R.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: C.faint, paddingHorizontal: 12, paddingVertical: 6 },
  addText: { fontSize: 13, color: C.muted, fontWeight: '600' },
  result: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  resultName: { fontSize: 15, fontWeight: '600', color: C.text },
  resultSub: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  total: { fontSize: 17, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  hist: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 5 },
  histLabel: { width: 56, fontSize: 13, color: C.muted, fontVariant: ['tabular-nums'] },
  barTrack: { flex: 1, height: 10, borderRadius: R.pill, backgroundColor: C.bg, overflow: 'hidden' },
  bar: { height: 10, borderRadius: R.pill, backgroundColor: C.faint },
  histTotal: { width: 88, textAlign: 'right', fontSize: 14, fontWeight: '600', color: C.text, fontVariant: ['tabular-nums'] },
  histNote: { fontSize: 12, color: C.muted, marginHorizontal: 16, marginBottom: 16, lineHeight: 17 },
  bigTotal: { fontSize: 28, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
}));
