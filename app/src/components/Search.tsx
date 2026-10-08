import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Market, SeriesFile, SeriesItem, useJson } from '../lib/data';
import { useSlashToFocus } from '../lib/hotkey';
import { lastTwo, peso, value } from '../lib/format';
import type { Spot } from '../lib/location';
import { fold, FoodSource } from '../lib/places';
import { C, R, TAB_LABELS, themed } from '../theme';
import { Card, Loading, PriceRow } from './bits';
import { ItemDetail, titleOf } from './FoodView';
import { Sheet } from './Sheet';

const CATS = ['rice', 'meat', 'seafood', 'vegetables', 'fruits', 'pantry'] as const;
type Srp = { sections: { name: string; items: { item: string; size?: string; srp: number }[] }[] };

/** Search every item for the current area (market data + DTI grocery SRPs). */
export function Search({ source, spot, markets }: { source: FoodSource | null; spot: Spot; markets: Market[] }) {
  const [q, setQ] = useState('');
  const input = useRef<TextInput>(null);
  useSlashToFocus(input);
  const [open, setOpen] = useState<{ item: SeriesItem; periods: string[] } | null>(null);
  const on = fold(q).length >= 2;
  const da = source?.kind === 'da';
  // fixed hook count: one per category file, null when not needed
  const files = [
    useJson<SeriesFile>(on && da ? 'da/index-rice.json' : null),
    useJson<SeriesFile>(on && da ? 'da/index-meat.json' : null),
    useJson<SeriesFile>(on && da ? 'da/index-seafood.json' : null),
    useJson<SeriesFile>(on && da ? 'da/index-vegetables.json' : null),
    useJson<SeriesFile>(on && da ? 'da/index-fruits.json' : null),
    useJson<SeriesFile>(on && da ? 'da/index-pantry.json' : null),
    useJson<SeriesFile>(on && source?.kind === 'psa' ? `psa/${source.code}.json` : null),
  ];
  const srp = useJson<Srp>(on ? 'grocery/srp.json' : null);
  const loading = files.some((f) => f.loading) || srp.loading;

  const results = useMemo(() => {
    if (!on) return { items: [], grocery: [] };
    const needle = fold(q);
    const items: { it: SeriesItem; periods: string[] }[] = [];
    for (const f of files) {
      for (const it of f.data?.items ?? []) {
        if (!CATS.includes(it.cat as (typeof CATS)[number])) continue;
        if (fold(`${it.item} ${it.spec ?? ''} ${TAB_LABELS[it.cat] ?? ''}`).includes(needle) && lastTwo(it.s).lastIdx >= 0) {
          items.push({ it, periods: f.data!.periods });
        }
      }
    }
    const grocery = (srp.data?.sections ?? []).flatMap((s) =>
      s.items.filter((it) => fold(`${it.item} ${s.name}`).includes(needle)).map((it) => ({ ...it, section: s.name })));
    return { items: items.slice(0, 25), grocery: grocery.slice(0, 15) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, q, srp.data, ...files.map((f) => f.data)]);

  return (
    <View>
      <TextInput
        ref={input}
        value={q}
        onChangeText={setQ}
        placeholder="Search any price: galunggong, sibuyas, kape…"
        placeholderTextColor={C.faint}
        style={s.input}
        autoCorrect={false}
        accessibilityLabel="Search prices"
        clearButtonMode="while-editing"
      />
      {on ? (
        loading ? <Loading /> : (
          <>
            {results.items.length ? (
              <Card>
                {results.items.map(({ it, periods }) => {
                  const { last, prev, lastIdx } = lastTwo(it.s);
                  return (
                    <PriceRow key={`${it.cat}|${it.item}|${it.spec}|${it.origin}`} title={it.item}
                      subtitle={[TAB_LABELS[it.cat], it.spec].filter(Boolean).join(' · ')}
                      badge={it.origin === 'imported' ? 'Imported' : it.origin === 'local' ? 'Local' : undefined}
                      price={it.s[lastIdx] ?? null} unit={it.unit} last={last} prev={prev}
                      onPress={() => setOpen({ item: it, periods })} />
                  );
                })}
              </Card>
            ) : null}
            {results.grocery.length ? (
              <Card>
                {results.grocery.map((g, i) => (
                  <View key={`${g.item}|${g.size}|${i}`} style={s.srp}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.srpName}>{g.item}</Text>
                      <Text style={s.srpSub}>DTI SRP · {g.section}{g.size ? ` · ${g.size}` : ''}</Text>
                    </View>
                    <Text style={s.srpPrice}>{peso(g.srp)}</Text>
                  </View>
                ))}
              </Card>
            ) : null}
            {!results.items.length && !results.grocery.length ? <Text style={s.none}>No matches for “{q}”.</Text> : null}
          </>
        )
      ) : null}
      <Sheet open={open != null} onClose={() => setOpen(null)} title={open ? titleOf(open.item) : ''}>
        {open ? (
          <ItemDetail item={open.item} periods={open.periods}
            cadence={source?.kind === 'da' ? 'day' : 'month'} compare={da ? { spot, markets } : undefined} />
        ) : null}
      </Sheet>
    </View>
  );
}

const s = themed(() => ({
  input: {
    marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: C.line, borderRadius: R.lg,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text, backgroundColor: C.card,
  },
  srp: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  srpName: { fontSize: 14, fontWeight: '600', color: C.text },
  srpSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  srpPrice: { fontSize: 15, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  none: { color: C.muted, marginHorizontal: 16, marginBottom: 12 },
}));
