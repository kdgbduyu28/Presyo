import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { GadgetFile, GadgetIndex, GadgetOffer, GadgetStore, useJson } from '../lib/data';
import { peso, periodLabel } from '../lib/format';
import { usePrefs } from '../lib/prefs';
import { C, R, themed } from '../theme';
import { StepChart } from './Chart';
import { Card, Chips, Columns, Loading, Notice, SectionTitle } from './bits';
import { Sheet } from './Sheet';

const whole = (n: number) => peso(n).replace(/\.00$/, '');

/** Series color by the store's fixed position in the store list (never by rank). */
function storeColor(stores: GadgetStore[], id: string) {
  const i = stores.findIndex((s) => s.id === id);
  return [C.s1, C.s2, C.s3, C.s4, C.s5][i] ?? C.muted;
}

/** Phone prices at the Apple Store and PH resellers, per storage, with history. */
export function GadgetsView({ wide }: { wide?: boolean }) {
  const idx = useJson<GadgetIndex>('gadgets/index.json');
  const { prefs, set } = usePrefs();
  const [open, setOpen] = useState(false);

  if (idx.loading) return <Loading />;
  if (!idx.data?.models.length) return <Notice tone="warn">Gadget prices aren't available right now.</Notice>;
  const { models, stores } = idx.data;
  const selected = models.find((m) => m.key === prefs.gadget) ?? models[0];
  const pick = (key: string) => {
    set({ gadget: key });
    if (!wide) setOpen(true);
  };
  const checked = stores.reduce((a, st) => (st.checked > a ? st.checked : a), '');
  const brands = [...new Set(models.map((m) => m.brand))];

  const list = (
    <>
      {brands.map((brand) => (
        <View key={brand}>
          <SectionTitle>{brand === 'Apple' ? 'iPhone' : brand}</SectionTitle>
          <Card>
            {models.filter((m) => m.brand === brand).map((m) => {
              const on = wide && m.key === selected.key;
              const below = m.srp && m.from && m.from < m.srp ? m.srp - m.from : 0;
              return (
                <Pressable key={m.key} onPress={() => pick(m.key)}
                  style={({ pressed }) => [s.row, (pressed || on) && { backgroundColor: on ? C.primarySoft : C.bg }]}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  accessibilityLabel={`${m.name}, ${m.from ? `from ${whole(m.from)}` : 'out of stock'}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.name, on && { color: C.primary }]}>{m.name}</Text>
                    <Text style={s.sub} numberOfLines={1}>
                      {m.specs.length > 1 ? `${m.specs[0]}–${m.specs[m.specs.length - 1]}` : m.specs[0]}
                      {' · '}{m.stores} {m.stores === 1 ? 'store' : 'stores'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {m.from ? (
                      <>
                        <Text style={s.price}><Text style={s.from}>from </Text>{whole(m.from)}</Text>
                        <Text style={[s.sub, below ? { color: C.down, fontWeight: '600' } : null]} numberOfLines={1}>
                          {below ? `${whole(below)} below Apple` : stores.find((st) => st.id === m.from_store)?.name}
                        </Text>
                      </>
                    ) : (
                      <Text style={s.sub}>Out of stock</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </Card>
        </View>
      ))}
      <Text style={s.source}>
        Prices from the Apple Store PH, Power Mac Center, Beyond the Box, iStore and Digital Walker websites,
        checked twice a day{checked ? ` (last ${periodLabel(checked)})` : ''}. “From” is the lowest price of a phone
        in stock. Presyo is not affiliated with these stores.
      </Text>
    </>
  );

  const detail = <GadgetDetail modelKey={selected.key} stores={stores} />;

  if (wide) {
    return (
      <Columns wide left={list} right={
        <>
          <SectionTitle>{selected.name}</SectionTitle>
          <Card style={{ padding: 16 }}>{detail}</Card>
        </>
      } />
    );
  }
  return (
    <View>
      {list}
      <Sheet open={open} onClose={() => setOpen(false)} title={selected.name}>{detail}</Sheet>
    </View>
  );
}

function GadgetDetail({ modelKey, stores }: { modelKey: string; stores: GadgetStore[] }) {
  const file = useJson<GadgetFile>(`gadgets/${modelKey}.json`);
  const { prefs, set } = usePrefs();

  const lowest = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of file.data?.variants ?? []) {
      const ps = v.offers.filter((o) => o.price != null && o.stock !== false).map((o) => o.price as number);
      if (ps.length) out[v.spec] = Math.min(...ps);
    }
    return out;
  }, [file.data]);

  if (file.loading) return <Loading />;
  if (!file.data) return <Notice tone="warn">Couldn't load prices ({file.error}).</Notice>;
  const { variants, end } = file.data;
  const variant = variants.find((v) => v.spec === prefs.gadgetSpec) ?? variants[0];
  const best = lowest[variant.spec];
  const apple = variant.offers.find((o) => o.store === 'apple' && o.price != null)?.price;
  const storeName = (id: string) => stores.find((st) => st.id === id)?.name ?? id;
  const series = variant.offers.filter((o) => o.h.length).map((o) => ({
    id: o.store, label: storeName(o.store), color: storeColor(stores, o.store), h: o.h,
  }));
  const start = series.reduce((a, sr) => (sr.h[0][0] < a ? sr.h[0][0] : a), end);

  return (
    <View>
      {variants.length > 1 ? (
        <View style={{ marginHorizontal: -16 }}>
          <Chips options={variants.map((v) => ({
            id: v.spec, label: v.spec, hint: lowest[v.spec] ? whole(lowest[v.spec]) : 'out of stock',
          }))} value={variant.spec} onChange={(spec) => set({ gadgetSpec: spec })} />
        </View>
      ) : null}

      <Text style={s.h}>Prices now · {variant.spec}</Text>
      {variant.offers.map((o) => (
        <OfferRow key={o.store} offer={o} name={storeName(o.store)} color={storeColor(stores, o.store)}
          official={!!stores.find((st) => st.id === o.store)?.official} lowest={o.price != null && o.price === best && o.stock !== false}
          apple={apple} />
      ))}

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
        </View>
        <Text style={[s.sub, o.stock === false || !listed ? { color: C.faint } : null]} numberOfLines={2}>{status}</Text>
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
}));
