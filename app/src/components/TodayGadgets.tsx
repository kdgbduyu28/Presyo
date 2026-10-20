import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GadgetFile, GadgetIndex, GadgetModel, load, SummaryItem, useJson } from '../lib/data';
import { value } from '../lib/format';
import { bestOffer, metAlerts, parseGadgetId } from '../lib/gadgets';
import { usePrefs } from '../lib/prefs';
import { useWatch } from '../lib/watch';
import { C, themed } from '../theme';
import { Card, SectionTitle } from './bits';
import { whole } from './GadgetsView';

type Pick = { id: string; name: string; spec: string; price: number | null; store?: string; drop?: number };

/** Starred / alerted gadget variants with today's lowest buyable price. */
function useGadgetPicks(ids: string[]): Pick[] {
  const [picks, setPicks] = useState<Pick[]>([]);
  const wanted = ids.join(',');
  useEffect(() => {
    let live = true;
    const parsed = ids.map((id) => ({ id, ...parseGadgetId(id)! }));
    Promise.all([...new Set(parsed.map((p) => p.key))].map((k) => load<GadgetFile>(`gadgets/${k}.json`).catch(() => null)))
      .then((files) => {
        if (!live) return;
        const byKey = new Map(files.filter((f): f is GadgetFile => !!f).map((f) => [f.key, f]));
        setPicks(parsed.flatMap(({ id, key, spec }) => {
          const f = byKey.get(key);
          const v = f?.variants.find((x) => x.spec === spec);
          if (!f || !v) return [];
          const b = bestOffer(v);
          return [{ id, name: f.name, spec, price: b?.price ?? null, store: b?.store, drop: b?.drop }];
        }));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  return picks;
}

/** Today: price alerts that were met, starred gadgets and the biggest gadget price drops. */
export function TodayGadgets({ food, onOpenTab }: { food: SummaryItem[]; onOpenTab: (tab: string) => void }) {
  const watch = useWatch();
  const { prefs, set } = usePrefs();
  const idx = useJson<GadgetIndex>('gadgets/index.json');
  const ids = [...new Set([...watch.keys, ...Object.keys(prefs.alerts)].filter((k) => k.startsWith('g:')))];
  const picks = useGadgetPicks(ids);
  const storeName = (id?: string) => idx.data?.stores.find((s) => s.id === id)?.name ?? '';

  const prices: Record<string, number | null> = {};
  for (const p of picks) prices[p.id] = p.price;
  for (const it of food) if (it.key) prices[it.key] = value(it.last);
  const met = metAlerts(prefs.alerts, prices);
  const labelOf = (id: string) => {
    const p = picks.find((x) => x.id === id);
    if (p) return `${p.name} ${p.spec}`;
    return food.find((it) => it.key === id)?.item ?? id;
  };
  const open = (id: string) => {
    const g = parseGadgetId(id);
    if (g) {
      const m = idx.data?.models.find((x) => x.key === g.key);
      set({ gadget: g.key, gadgetSpec: g.spec, ...(m ? { gadgetCat: m.cat } : {}) });
      onOpenTab('gadgets');
    } else {
      const it = food.find((x) => x.key === id);
      if (it) onOpenTab(it.cat);
    }
  };

  const mine = picks.filter((p) => watch.has(p.id));
  const deals = (idx.data?.deals ?? []).map((k) => idx.data!.models.find((m) => m.key === k))
    .filter((m): m is GadgetModel => !!m).slice(0, 3);

  return (
    <>
      {Object.keys(met).length ? (
        <View style={s.alert}>
          <Text style={s.alertTitle}>🔔 Price alert{Object.keys(met).length > 1 ? 's' : ''}</Text>
          {Object.entries(met).map(([id, price]) => (
            <Pressable key={id} onPress={() => open(id)} accessibilityRole="button">
              <Text style={s.alertText}>
                <Text style={s.bold}>{labelOf(id)}</Text> is {whole(price)} — at or below your {whole(prefs.alerts[id])}
                {' '}target ›
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {mine.length ? (
        <>
          <SectionTitle>My gadgets</SectionTitle>
          <Card>
            {mine.map((p) => (
              <Pressable key={p.id} onPress={() => open(p.id)} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.bg }]}
                accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={s.name}><Text style={{ color: C.star }}>★ </Text>{p.name}</Text>
                  <Text style={s.sub}>{p.spec}{p.store ? ` · ${storeName(p.store)}` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.price}>{p.price != null ? whole(p.price) : 'Out of stock'}</Text>
                  {p.drop ? <Text style={[s.sub, s.good]}>▼ {whole(p.drop)}</Text> : null}
                  {prefs.alerts[p.id] ? <Text style={s.sub}>🔔 {whole(prefs.alerts[p.id])}</Text> : null}
                </View>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      {deals.length ? (
        <>
          <SectionTitle>Gadget price drops</SectionTitle>
          <Card>
            {deals.map((m) => (
              <Pressable key={m.key} onPress={() => { set({ gadget: m.key, gadgetSpec: m.deal!.spec, gadgetCat: m.cat }); onOpenTab('gadgets'); }}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: C.bg }]} accessibilityRole="button">
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{m.name}</Text>
                  <Text style={s.sub}>{m.deal!.spec} · {storeName(m.deal!.store)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.price}>{whole(m.deal!.price)}</Text>
                  <Text style={[s.sub, s.good]}>▼ {Math.round(m.deal!.pct * 100)}% ({whole(m.deal!.drop)})</Text>
                </View>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

const s = themed(() => ({
  alert: {
    backgroundColor: C.downBg, borderColor: C.down, borderWidth: 1, borderRadius: 12,
    marginHorizontal: 16, marginBottom: 12, padding: 12, gap: 6,
  },
  alertTitle: { fontSize: 14, fontWeight: '800', color: C.down },
  alertText: { fontSize: 14, color: C.text, lineHeight: 19 },
  bold: { fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  name: { fontSize: 15, fontWeight: '600', color: C.text },
  sub: { fontSize: 12, color: C.muted, marginTop: 1 },
  good: { color: C.down, fontWeight: '600' },
  price: { fontSize: 16, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
}));
