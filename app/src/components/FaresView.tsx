import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { fare, FaresFile } from '../lib/bills';
import { useJson } from '../lib/data';
import { peso, periodLabel } from '../lib/format';
import { usePrefs } from '../lib/prefs';
import { C, R, themed } from '../theme';
import { Card, Chips, Columns, Loading, Notice, SectionTitle } from './bits';

const MATRIX_KM = Array.from({ length: 20 }, (_, i) => i + 1);

/** LTFRB jeepney and bus fares: trip fare by distance, plus a fare matrix. */
export function FaresView({ wide }: { wide?: boolean }) {
  const file = useJson<FaresFile>('fares.json');
  const { prefs, set } = usePrefs();
  const [kmText, setKmText] = useState(String(prefs.fareKm));
  const [matrixMode, setMatrixMode] = useState('jeep');
  const setKm = (t: string) => {
    setKmText(t);
    if (parseFloat(t) > 0) set({ fareKm: parseFloat(t) });
  };

  if (file.loading) return <Loading />;
  if (!file.data) return <Notice tone="warn">Fares aren't available right now.</Notice>;
  const f = file.data;
  const km = parseFloat(kmText);
  const opts = { rounding: f.rounding, discountPct: prefs.fareDiscount ? f.discount.pct : 0 };
  const mode = f.modes.find((m) => m.id === matrixMode) ?? f.modes[0];

  const trip = (
    <>
      <Notice>{f.status}</Notice>
      <SectionTitle>Your trip</SectionTitle>
      <Card style={{ padding: 16 }}>
        <View style={s.inputRow}>
          <Text style={s.label}>Distance</Text>
          <TextInput value={kmText} onChangeText={setKm} keyboardType="decimal-pad" style={s.input}
            accessibilityLabel="Trip distance in kilometers" selectTextOnFocus />
          <Text style={s.label}>km</Text>
        </View>
        <View style={s.inputRow}>
          <Text style={[s.label, { flex: 1 }]}>{f.discount.who} ({f.discount.pct}% off)</Text>
          <Switch value={prefs.fareDiscount} onValueChange={(v) => set({ fareDiscount: v })}
            trackColor={{ true: C.primary, false: C.line }} accessibilityLabel="Discounted fare" />
        </View>
      </Card>
      <Card>
        {f.modes.map((m) => {
          const now = km > 0 ? fare(m, km, opts) : null;
          const before = km > 0 && m.prev_base != null && m.prev_per_km != null
            ? fare({ base: m.prev_base, base_km: m.base_km, per_km: m.prev_per_km }, km, opts) : null;
          return (
            <View key={m.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{m.name}</Text>
                <Text style={s.rowSub}>
                  {peso(m.base)} first {m.base_km} km, then {peso(m.per_km)}/km
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.rowPrice}>{now == null ? '—' : peso(now)}</Text>
                {before != null && now != null && before !== now ? (
                  <Text style={s.was}>was {peso(before)}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>
      <Text style={s.source}>
        LTFRB fares effective {periodLabel(f.effective)}, {f.effective.slice(0, 4)}. Fares are rounded to the
        nearest 25 centavos, like the official fare matrix. Taxi, UV Express and TNVS fares aren't included yet.
      </Text>
    </>
  );

  const matrix = (
    <>
      <SectionTitle>Fare matrix</SectionTitle>
      <Chips options={f.modes.map((m) => ({ id: m.id, label: m.name }))} value={mode.id} onChange={setMatrixMode} />
      <Card>
        <View style={[s.mRow, s.mHead]}>
          <Text style={[s.mCell, s.mHeadText]}>km</Text>
          <Text style={[s.mCell, s.mHeadText, s.mNum]}>Regular</Text>
          <Text style={[s.mCell, s.mHeadText, s.mNum]}>Discounted</Text>
        </View>
        {MATRIX_KM.map((k) => (
          <Pressable key={k} onPress={() => setKm(String(k))}
            style={({ pressed }) => [s.mRow, (pressed || k === km) && { backgroundColor: C.primarySoft }]}
            accessibilityRole="button" accessibilityLabel={`${k} km`}>
            <Text style={s.mCell}>{k}</Text>
            <Text style={[s.mCell, s.mNum]}>{peso(fare(mode, k, { rounding: f.rounding }))}</Text>
            <Text style={[s.mCell, s.mNum]}>{peso(fare(mode, k, { rounding: f.rounding, discountPct: f.discount.pct }))}</Text>
          </Pressable>
        ))}
      </Card>
    </>
  );

  return <Columns wide={wide} left={trip} right={matrix} />;
}

const s = themed(() => ({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  label: { fontSize: 14, color: C.muted },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 16, color: C.text, backgroundColor: C.card, width: 80, textAlign: 'right',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  rowName: { fontSize: 15, fontWeight: '700', color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  rowPrice: { fontSize: 17, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  was: { fontSize: 12, color: C.faint, marginTop: 1, fontVariant: ['tabular-nums'] },
  mRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  mHead: { backgroundColor: C.bg },
  mHeadText: { fontWeight: '700', color: C.muted, fontSize: 12, textTransform: 'uppercase' },
  mCell: { flex: 1, fontSize: 14, color: C.text },
  mNum: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24 },
}));
