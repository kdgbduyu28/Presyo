import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useJson } from '../lib/data';
import { useSlashToFocus } from '../lib/hotkey';
import { fold } from '../lib/places';
import { peso, periodLabel } from '../lib/format';
import { C, R, themed } from '../theme';
import { Card, Loading, Notice, SectionTitle } from './bits';

type SrpFile = {
  effective: string;
  url: string;
  sections: { name: string; items: { item: string; size?: string; srp: number }[] }[];
};

/** DTI suggested retail prices: what groceries and supermarkets should charge. */
export function GroceryView() {
  const { data, loading, error } = useJson<SrpFile>('grocery/srp.json');
  const [q, setQ] = useState('');
  const input = useRef<TextInput>(null);
  useSlashToFocus(input);
  const sections = useMemo(() => {
    if (!data) return [];
    const needle = fold(q);
    if (needle.length < 2) return data.sections;
    return data.sections
      .map((s) => ({
        ...s,
        items: fold(s.name).includes(needle) ? s.items : s.items.filter((it) => fold(it.item).includes(needle)),
      }))
      .filter((s) => s.items.length);
  }, [data, q]);

  if (loading) return <Loading />;
  if (error || !data) return <Notice tone="warn">Couldn't load grocery prices ({error}).</Notice>;
  return (
    <View>
      <Notice>
        DTI's suggested retail prices (SRP) for basic goods, nationwide, effective {periodLabel(data.effective)}{' '}
        {data.effective.slice(0, 4)}. Stores shouldn't charge more. Report overpricing to the DTI hotline 1-384.
      </Notice>
      <TextInput
        ref={input}
        value={q}
        onChangeText={setQ}
        placeholder="Search: sardinas, kape, pandesal, sabon…"
        placeholderTextColor={C.faint}
        style={s.search}
        autoCorrect={false}
        accessibilityLabel="Search grocery items"
      />
      {sections.map((sec) => (
        <View key={sec.name}>
          <SectionTitle>{sec.name}</SectionTitle>
          <Card>
            {sec.items.map((it, i) => (
              <View key={`${it.item}|${it.size}|${i}`} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{it.item}</Text>
                  {it.size ? <Text style={s.size}>{it.size}</Text> : null}
                </View>
                <Text style={s.price}>{peso(it.srp)}</Text>
              </View>
            ))}
          </Card>
        </View>
      ))}
      {!sections.length ? <Notice>No item matches “{q}”.</Notice> : null}
      <Text style={s.source}>DTI Basic Necessities and Prime Commodities SRP bulletin.</Text>
    </View>
  );
}

const s = themed(() => ({
  search: {
    marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: C.line, borderRadius: R.lg,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text, backgroundColor: C.card,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  name: { fontSize: 14, color: C.text, fontWeight: '600' },
  size: { fontSize: 12, color: C.muted, marginTop: 1 },
  price: { fontSize: 15, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24 },
}));
