import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { MedicineFile, MedicineItem, useJson } from '../lib/data';
import { peso, periodLabel } from '../lib/format';
import { C, R, themed } from '../theme';
import { Card, Chips, Loading, Notice, SectionTitle } from './bits';

// Medicines people buy most at the botika; the list starts with these.
const COMMON = ['paracetamol', 'ibuprofen', 'mefenamic acid', 'amoxicillin', 'co-amoxiclav', 'cefalexin', 'azithromycin',
  'cetirizine', 'loratadine', 'salbutamol', 'losartan', 'amlodipine', 'metformin', 'atorvastatin', 'simvastatin',
  'omeprazole', 'ascorbic acid', 'ferrous', 'oral rehydration', 'metoprolol', 'carbocisteine', 'ambroxol'];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MAX = 80;

/** DOH Drug Price Reference Index + legal maximum retail prices, searchable. */
export function MedicineView() {
  const { data, loading, error } = useJson<MedicineFile>('medicine.json');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'common' | 'mrp' | 'all'>('common');

  const list = useMemo(() => {
    const items = data?.items ?? [];
    const query = norm(q.trim());
    if (query) {
      const words = query.split(/\s+/);
      return items.filter((it) => {
        const hay = norm(`${it.name} ${it.desc ?? ''} ${it.use ?? ''}`);
        return words.every((w) => hay.includes(w));
      });
    }
    if (mode === 'mrp') return items.filter((it) => it.mrp != null);
    if (mode === 'common') {
      // single-ingredient medicines, in the order of the list above
      // single-ingredient medicines in the order above; what a botika sells
      // (tablets, capsules, syrups) before hospital forms (vials, IV bags)
      const rank = (it: MedicineItem) => COMMON.findIndex((c) => norm(it.name).startsWith(c));
      const hospital = (it: MedicineItem) => (/vial|ampule|infusion|injection|\bbag\b|irrigation/i.test(it.desc ?? '') ? 1 : 0);
      return items.filter((it) => !it.name.includes('+') && rank(it) >= 0)
        .sort((a, b) => rank(a) - rank(b) || hospital(a) - hospital(b));
    }
    return items;
  }, [data, q, mode]);

  if (loading) return <Loading />;
  if (!data?.items.length) return <Notice tone="warn">Medicine prices aren't available right now{error ? ` (${error})` : ''}.</Notice>;

  return (
    <View>
      <View style={s.searchBox}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search a medicine, e.g. losartan 50 mg"
          placeholderTextColor={C.faint} style={s.search} accessibilityLabel="Search medicines" autoCorrect={false}
          clearButtonMode="while-editing" />
      </View>
      {!q ? (
        <Chips options={[
          { id: 'common', label: 'Common' },
          { id: 'mrp', label: 'Price-capped (MRP)' },
          { id: 'all', label: `All ${data.items.length}` },
        ]} value={mode} onChange={setMode} />
      ) : null}

      <SectionTitle>
        {q ? `${list.length} found` : mode === 'mrp' ? 'Legal maximum retail prices' : mode === 'common' ? 'Common medicines' : 'All medicines'}
        {' '}· per unit
      </SectionTitle>
      {list.length ? (
        <Card>{list.slice(0, MAX).map((it, i) => <MedRow key={`${it.name}|${it.desc}|${i}`} it={it} />)}</Card>
      ) : (
        <Notice>No match. DOH lists medicines by generic name (e.g. “paracetamol”, not a brand).</Notice>
      )}
      {list.length > MAX ? <Text style={s.more}>Showing {MAX} of {list.length}; type more to narrow it down.</Text> : null}

      <Text style={s.source}>
        <Text style={s.bold}>Reference price</Text>: the median (and lowest–highest) price government hospitals paid
        per unit, from DOH’s Drug Price Reference Index
        {data.dpri ? ` (${periodLabel(data.dpri.date)} ${data.dpri.date.slice(0, 4)})` : ''}. Drugstores usually charge
        more, but a price far above the highest is worth questioning.{'\n'}
        <Text style={s.bold}>Legal max (MRP)</Text>: the most a drugstore may charge for a price-regulated medicine
        {data.mrp ? ` (DOH list of ${periodLabel(data.mrp.date)} ${data.mrp.date.slice(0, 4)})` : ''}. Generic name
        only; brands may differ.{' '}
        <Text style={s.link} onPress={() => Linking.openURL('https://dpri.doh.gov.ph/').catch(() => {})}>dpri.doh.gov.ph</Text>
      </Text>
    </View>
  );
}

function MedRow({ it }: { it: MedicineItem }) {
  const change = it.prev && it.med ? (it.med - it.prev) / it.prev : null;
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{it.name}</Text>
        {it.desc ? <Text style={s.sub}>{it.desc}</Text> : null}
        {it.use ? <Text style={s.use}>{it.use}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: '45%' }}>
        {it.med != null ? (
          <>
            <Text style={s.price}>{peso(it.med)}</Text>
            {it.lo != null && it.hi != null && it.lo !== it.hi ? (
              <Text style={s.sub}>{peso(it.lo)}–{peso(it.hi)}</Text>
            ) : null}
            {change != null && Math.abs(change) >= 0.005 ? (
              <Text style={[s.sub, { color: change > 0 ? C.up : C.down }]}>
                {change > 0 ? '▲' : '▼'} {Math.abs(change * 100).toFixed(0)}% vs last list
              </Text>
            ) : null}
          </>
        ) : null}
        {it.mrp != null ? <Text style={s.mrp}>Legal max {peso(it.mrp)}</Text> : null}
      </View>
    </View>
  );
}

const s = themed(() => ({
  searchBox: { paddingHorizontal: 16, paddingBottom: 12 },
  search: {
    backgroundColor: C.card, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, borderRadius: R.lg,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: C.text,
  },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  name: { fontSize: 15, fontWeight: '700', color: C.text },
  sub: { fontSize: 12, color: C.muted, marginTop: 1, fontVariant: ['tabular-nums'] },
  use: { fontSize: 11, color: C.faint, marginTop: 2 },
  price: { fontSize: 16, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  mrp: { fontSize: 12, fontWeight: '700', color: C.warn, marginTop: 2 },
  more: { fontSize: 12, color: C.muted, marginHorizontal: 16, marginBottom: 12 },
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24, lineHeight: 17 },
  bold: { fontWeight: '700', color: C.muted },
  link: { color: C.primary, fontWeight: '600' },
}));
