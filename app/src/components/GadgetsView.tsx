import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { GadgetFile, GadgetIndex, GadgetModel, GadgetOffer, GadgetStore, useJson } from '../lib/data';
import { peso, periodLabel } from '../lib/format';
import { abroadRows, bestOffer, gadgetId, installment, money } from '../lib/gadgets';
import { usePrefs } from '../lib/prefs';
import { useWatch } from '../lib/watch';
import { C, R, themed } from '../theme';
import { AlertControl } from './AlertControl';
import { StepChart } from './Chart';
import { Card, Chips, Columns, Loading, Notice, SectionTitle } from './bits';
import { Sheet } from './Sheet';

export const whole = (n: number) => peso(n).replace(/\.00$/, '');

/** Series color by the store's fixed slot (never by rank), so a store keeps its color. */
export function storeColor(stores: GadgetStore[], id: string) {
  const slot = stores.find((s) => s.id === id)?.slot ?? 0;
  return [C.s1, C.s2, C.s3, C.s4, C.s5, C.s6, C.s7, C.s8][slot - 1] ?? C.muted;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Phones, tablets, Macs, watches, AirPods, consoles and new games across PH stores, with history. */
export function GadgetsView({ wide }: { wide?: boolean }) {
  const idx = useJson<GadgetIndex>('gadgets/index.json');
  const { prefs, set } = usePrefs();
  const [open, setOpen] = useState(false);

  if (idx.loading) return <Loading />;
  if (!idx.data?.models.length) return <Notice tone="warn">Gadget prices aren't available right now.</Notice>;
  const data = idx.data;
  const { models, stores, categories } = data;
  const cat = categories.some((c) => c.id === prefs.gadgetCat) ? prefs.gadgetCat : categories[0].id;
  const inCat = models.filter((m) => m.cat === cat);
  const selected = inCat.find((m) => m.key === prefs.gadget) ?? inCat[0];
  const pick = (m: GadgetModel) => {
    set({ gadget: m.key, gadgetCat: m.cat });
    if (!wide) setOpen(true);
  };
  const storeName = (id?: string) => stores.find((st) => st.id === id)?.name ?? id ?? '';
  const deals = data.deals.map((k) => models.find((m) => m.key === k)).filter((m): m is GadgetModel => !!m);
  const groupOf = (m: GadgetModel) => (cat === 'games' ? m.specs[0]?.split(' · ')[0] ?? '' : m.make);
  const groups = [...new Set(inCat.map(groupOf))];

  const modelRow = (m: GadgetModel) => {
    const on = wide && m.key === selected?.key;
    const below = m.srp && m.from && m.from < m.srp ? m.srp - m.from : 0;
    const badge = m.deal
      ? `▼ ${pct(m.deal.pct)} at ${storeName(m.deal.store)}`
      : m.low30 ? 'Lowest in 30 days' : below ? `${whole(below)} below Apple` : null;
    return (
      <Pressable key={m.key} onPress={() => pick(m)}
        style={({ pressed }) => [s.row, (pressed || on) && { backgroundColor: on ? C.primarySoft : C.bg }]}
        accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={`${m.name}, ${m.from ? `from ${whole(m.from)}` : 'out of stock'}${badge ? `, ${badge}` : ''}`}>
        <View style={{ flex: 1 }}>
          <Text style={[s.name, on && { color: C.primary }]} numberOfLines={2}>{m.name}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {m.cat === 'games' ? m.specs.join(', ') : m.specs.length > 1 ? `${m.specs.length} versions` : m.specs[0]}
            {' · '}{m.stores} {m.stores === 1 ? 'store' : 'stores'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '50%' }}>
          {m.from ? (
            <>
              <Text style={s.price}><Text style={s.from}>from </Text>{whole(m.from)}</Text>
              <Text style={[s.sub, badge ? s.good : null]} numberOfLines={1}>{badge ?? storeName(m.from_store)}</Text>
            </>
          ) : <Text style={s.sub}>Out of stock</Text>}
        </View>
      </Pressable>
    );
  };

  const list = (
    <>
      <Chips options={categories.map((c) => ({ id: c.id, label: c.label }))} value={cat}
        onChange={(id) => set({ gadgetCat: id })} />
      {deals.length ? (
        <>
          <SectionTitle>Price drops, last 2 weeks</SectionTitle>
          <Card>{deals.slice(0, 5).map(modelRow)}</Card>
        </>
      ) : null}
      {groups.map((g) => (
        <View key={g}>
          <SectionTitle>{cat === 'phones' && g === 'Apple' ? 'iPhone' : g}</SectionTitle>
          <Card>{inCat.filter((m) => groupOf(m) === g).map(modelRow)}</Card>
        </View>
      ))}
      <Text style={s.source}>
        Prices from the stores’ own websites ({stores.map((st) => st.name).join(', ')}), checked twice a day
        (last {periodLabel(data.end)}). “From” is the lowest price of one in stock. Presyo is not affiliated with
        these stores.
      </Text>
    </>
  );

  const detail = selected ? <GadgetDetail modelKey={selected.key} index={data} /> : null;

  if (wide) {
    return (
      <Columns wide left={list} right={selected ? (
        <>
          <SectionTitle>{selected.name}</SectionTitle>
          <Card style={{ padding: 16 }}>{detail}</Card>
        </>
      ) : null} />
    );
  }
  return (
    <View>
      {list}
      <Sheet open={open} onClose={() => setOpen(false)} title={selected?.name}>{detail}</Sheet>
    </View>
  );
}

const MONTHS = [3, 6, 12, 24] as const;

export function GadgetDetail({ modelKey, index }: { modelKey: string; index: GadgetIndex }) {
  const file = useJson<GadgetFile>(`gadgets/${modelKey}.json`);
  const { prefs, set } = usePrefs();
  const watch = useWatch();
  const [months, setMonths] = useState<(typeof MONTHS)[number]>(12);
  const { stores, countries } = index;

  const lowest = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of file.data?.variants ?? []) {
      const b = bestOffer(v);
      if (b?.price != null) out[v.spec] = b.price;
    }
    return out;
  }, [file.data]);

  if (file.loading) return <Loading />;
  if (!file.data) return <Notice tone="warn">Couldn't load prices ({file.error}).</Notice>;
  const { variants, end } = file.data;
  const variant = variants.find((v) => v.spec === prefs.gadgetSpec) ?? variants[0];
  const best = bestOffer(variant);
  const apple = variant.offers.find((o) => o.store === 'apple' && o.price != null)?.price;
  const storeName = (id: string) => stores.find((st) => st.id === id)?.name ?? id;
  const series = variant.offers.filter((o) => o.h.length).map((o) => ({
    id: o.store, label: storeName(o.store), color: storeColor(stores, o.store), h: o.h,
  }));
  const start = series.reduce((a, sr) => (sr.h[0][0] < a ? sr.h[0][0] : a), end);
  const id = gadgetId(modelKey, variant.spec);
  const starred = watch.has(id);
  const abroad = abroadRows(variant, countries, apple ?? best?.price ?? null);

  return (
    <View>
      {variants.length > 1 ? (
        <View style={{ marginHorizontal: -16 }}>
          <Chips options={variants.map((v) => ({
            id: v.spec, label: v.spec, hint: lowest[v.spec] ? whole(lowest[v.spec]) : 'out of stock',
          }))} value={variant.spec} onChange={(spec) => set({ gadgetSpec: spec })} />
        </View>
      ) : null}

      <View style={s.actionsRow}>
        <Pressable onPress={() => watch.toggle(id)} style={[s.star, starred && s.starOn]} hitSlop={6}
          accessibilityRole="button" accessibilityState={{ selected: starred }}>
          <Text style={[s.starText, starred && { color: C.onPrimary }]}>{starred ? '★ On Today' : '☆ Show on Today'}</Text>
        </Pressable>
      </View>
      <View style={{ marginBottom: 12 }}>
        <AlertControl id={id} current={best?.price ?? null} />
      </View>

      <Text style={s.h}>Prices now · {variant.spec}</Text>
      {variant.offers.map((o) => (
        <OfferRow key={o.store} offer={o} name={storeName(o.store)} color={storeColor(stores, o.store)}
          official={!!stores.find((st) => st.id === o.store)?.official}
          lowest={!!best && o.store === best.store} apple={apple} />
      ))}

      {best?.price ? (
        <>
          <Text style={[s.h, { marginTop: 20 }]}>Installment</Text>
          <View style={s.monthRow}>
            {MONTHS.map((n) => (
              <Pressable key={n} onPress={() => setMonths(n)} style={[s.month, months === n && s.monthOn]}
                accessibilityRole="button" accessibilityState={{ selected: months === n }}>
                <Text style={[s.monthText, months === n && s.monthTextOn]}>{n} mo</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.instBig}>{whole(installment(best.price, months))}<Text style={s.from}> /month × {months}</Text></Text>
          <Text style={s.caption}>
            At 0% on {whole(best.price)} ({storeName(best.store)}). Many credit cards offer 0% at these stores for
            up to 24 months; with a 1%/month add-on it’s {whole(installment(best.price, months, 0.01))}/month.
          </Text>
        </>
      ) : null}

      {abroad.length ? (
        <>
          <Text style={[s.h, { marginTop: 20 }]}>Apple Store abroad · {variant.spec}</Text>
          {abroad.map((r) => (
            <Pressable key={r.country.cc} onPress={() => Linking.openURL(r.url).catch(() => {})} style={s.offer}
              accessibilityRole="link">
              <View style={{ flex: 1 }}>
                <Text style={s.store}>{r.country.name}</Text>
                <Text style={s.sub} numberOfLines={2}>{money(r.price, r.country.cur)} · {r.country.note}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.price}>≈ {whole(r.php)}</Text>
                {r.vsPh != null && Math.abs(r.vsPh) >= 0.005 ? (
                  <Text style={[s.sub, { color: r.vsPh > 0 ? C.down : C.up }]}>
                    {pct(Math.abs(r.vsPh))} {r.vsPh > 0 ? 'cheaper' : 'dearer'}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          <Text style={s.caption}>
            In pesos at BSP’s reference rate ({periodLabel(abroad[0].country.rate_date)}), compared with{' '}
            {apple ? 'Apple PH' : 'the lowest PH price'}. Cards add 1–3% on foreign purchases; check that the model
            works on PH networks before buying abroad.
          </Text>
        </>
      ) : null}

      <Text style={[s.h, { marginTop: 20 }]}>Price history · {variant.spec}</Text>
      <StepChart start={start} end={end} series={series} />
      <Text style={s.caption}>
        {start === end
          ? `Presyo started tracking these stores on ${periodLabel(start)}; the lines grow as prices change.`
          : 'Each line holds a store’s price until it changes; a gap means the store stopped listing it.'}
        {' '}Press or hover on the chart to read a date’s prices.
      </Text>
    </View>
  );
}

function OfferRow({ offer: o, name, color, official, lowest, apple }: {
  offer: GadgetOffer; name: string; color: string; official: boolean; lowest: boolean; apple?: number;
}) {
  const listed = o.price != null;
  const status = !listed
    ? 'No longer listed'
    : o.pre
      ? 'Pre-order'
      : o.stock === false
        ? 'Out of stock'
        : o.stock && o.colors?.length
          ? `In stock: ${o.colors.join(', ')}`
          : official ? 'Official price' : 'In stock';
  const off = o.was && o.price ? Math.round((1 - o.price / o.was) * 100) : 0;
  const vsApple = listed && apple && !official ? (o.price as number) - apple : 0;
  return (
    <Pressable disabled={!o.url} onPress={() => o.url && Linking.openURL(o.url).catch(() => {})}
      style={({ pressed }) => [s.offer, pressed && { backgroundColor: C.bg }]}
      accessibilityRole="link" accessibilityLabel={`${name}: ${listed ? whole(o.price as number) : 'not listed'}, ${status}. Open store`}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <View style={s.nameLine}>
          <Text style={s.store}>{name}</Text>
          {official ? <Text style={s.badge}>Official</Text> : null}
          {lowest ? <Text style={[s.badge, s.badgeBest]}>Lowest</Text> : null}
          {o.low30 ? <Text style={[s.badge, s.badgeBest]}>30-day low</Text> : null}
        </View>
        <Text style={[s.sub, o.stock === false || !listed ? { color: C.faint } : null]} numberOfLines={2}>
          {status}{o.note ? ` · ${o.note}` : ''}
        </Text>
        {o.drop && o.since ? (
          <Text style={[s.sub, s.good]}>▼ {whole(o.drop)} on {periodLabel(o.since)}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {listed ? (
          <Text style={[s.price, o.stock === false && { color: C.muted }]}>{whole(o.price as number)}</Text>
        ) : <Text style={s.sub}>—</Text>}
        {o.was && off > 0 ? (
          <Text style={s.sub}><Text style={s.was}>{whole(o.was)}</Text> <Text style={{ color: C.down }}>−{off}%</Text></Text>
        ) : null}
        {vsApple ? (
          <Text style={[s.sub, { color: vsApple < 0 ? C.down : C.up }]}>
            {whole(Math.abs(vsApple))} {vsApple < 0 ? 'below' : 'above'} Apple
          </Text>
        ) : null}
      </View>
      {o.url ? <Text style={s.chev}>›</Text> : null}
    </Pressable>
  );
}

const s = themed(() => ({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  name: { fontSize: 15, fontWeight: '700', color: C.text },
  sub: { fontSize: 12, color: C.muted, marginTop: 1 },
  good: { color: C.down, fontWeight: '600' },
  from: { fontSize: 12, fontWeight: '400', color: C.muted },
  price: { fontSize: 16, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  was: { textDecorationLine: 'line-through' },
  h: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  offer: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  store: { fontSize: 15, fontWeight: '600', color: C.text },
  badge: {
    fontSize: 11, color: C.muted, borderWidth: 1, borderColor: C.line, borderRadius: R.pill,
    paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden',
  },
  badgeBest: { color: C.down, borderColor: C.down },
  chev: { fontSize: 20, color: C.faint, marginLeft: 2 },
  caption: { color: C.muted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24, lineHeight: 17 },
  actionsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  star: { borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 },
  starOn: { backgroundColor: C.star, borderColor: C.star },
  starText: { fontSize: 13, fontWeight: '600', color: C.text },
  monthRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  month: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.pill, borderWidth: 1, borderColor: C.line },
  monthOn: { backgroundColor: C.text, borderColor: C.text },
  monthText: { fontSize: 13, fontWeight: '600', color: C.muted },
  monthTextOn: { color: C.bg },
  instBig: { fontSize: 24, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
}));
