import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Concessionaire, waterProviders, WaterFile } from '../lib/bills';
import { useJson } from '../lib/data';
import { peso, periodLabel } from '../lib/format';
import { Place } from '../lib/places';
import { usePrefs } from '../lib/prefs';
import { C, themed } from '../theme';
import { Card, Chips, Delta, Loading, Notice, SectionTitle } from './bits';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${peso(Math.abs(n))}`;

/** Metro Manila water: MWSS concessionaire tariffs and quarterly adjustments. */
export function WaterView({ place }: { place: Place }) {
  const file = useJson<WaterFile>('water.json');
  const { prefs, set } = usePrefs();

  if (file.loading) return <Loading />;
  if (!file.data) return <Notice tone="warn">Water rates aren't available right now.</Notice>;
  const all = file.data.concessionaires;
  const here = waterProviders(file.data, place.code);
  const options = here.length ? here : all;
  const chosen = options.find((c) => c.id === prefs.waterCo) ?? options[0];

  return (
    <View>
      {!here.length ? (
        <Notice>
          Presyo covers Metro Manila's two water concessionaires (and the Rizal and Cavite towns they serve). Elsewhere,
          your local water district sets its own rates; these are shown for reference.
        </Notice>
      ) : null}
      {options.length > 1 ? (
        <Chips options={options.map((c) => ({ id: c.id, label: c.name, hint: c.zone }))} value={chosen.id}
          onChange={(waterCo) => set({ waterCo })} />
      ) : null}
      {here.length > 1 ? (
        <Notice>Both concessionaires serve parts of {place.name}. Your bill says which one is yours.</Notice>
      ) : null}
      <Provider c={chosen} sewered={prefs.sewered} onSewered={(sewered) => set({ sewered })} />
      <Text style={s.source}>
        MWSS Regulatory Office rates as reported when announced (last checked {periodLabel(file.data.checked)}).
        Tap an adjustment for the announcement.
      </Text>
    </View>
  );
}

function Provider({ c, sewered, onSewered }: { c: Concessionaire; sewered: boolean; onSewered: (v: boolean) => void }) {
  const rate = sewered ? c.all_in.sewered : c.all_in.unsewered;
  const prev = sewered ? c.all_in.prev_sewered : c.all_in.prev_unsewered;
  return (
    <>
      <SectionTitle>{c.name} · {c.zone}</SectionTitle>
      <Card style={{ padding: 16 }}>
        <Text style={s.caption}>Average all-in tariff since {periodLabel(c.all_in.effective.slice(0, 7))}</Text>
        <View style={s.big}>
          <Text style={s.bigPrice}>{peso(rate)}<Text style={s.bigUnit}>/cu.m</Text></Text>
          <Delta last={rate} prev={prev ?? null} />
          {prev ? <Text style={s.caption}>vs {Number(c.all_in.effective.slice(0, 4)) - 1}</Text> : null}
        </View>
        <Text style={s.caption}>
          Average across all customer types, before the quarterly adjustments below. Households pay less per cu.m:
          the first 10 cu.m is a minimum charge, and rates rise with use.
        </Text>
        <View style={s.switchRow}>
          <Text style={[s.caption, { flex: 1 }]}>Connected to the sewer line (sewerage charge on your bill)</Text>
          <Switch value={sewered} onValueChange={onSewered} trackColor={{ true: C.primary, false: C.line }}
            accessibilityLabel="Sewered connection" />
        </View>
      </Card>

      <SectionTitle>Quarterly adjustments</SectionTitle>
      <Card>
        {c.adjustments.map((a) => (
          <Pressable key={a.quarter} onPress={() => Linking.openURL(a.source).catch(() => {})}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: C.bg }]} accessibilityRole="link">
            <View style={{ flex: 1 }}>
              <Text style={s.rowName}>{a.quarter.replace('-', ' ')}</Text>
              <Text style={s.rowSub}>{a.what}</Text>
              {a.bill ? (
                <Text style={s.rowSub}>
                  Bill: {Object.entries(a.bill).map(([cum, d]) => `${signed(d)} at ${cum} cu.m`).join(' · ')}
                </Text>
              ) : null}
            </View>
            <Text style={[s.rowPrice, { color: a.per_cum > 0 ? C.up : a.per_cum < 0 ? C.down : C.muted }]}>
              {a.per_cum ? `${signed(a.per_cum)}/cu.m` : 'no change'}
            </Text>
          </Pressable>
        ))}
      </Card>
      <Notice>
        4Ps beneficiaries and other qualified households using up to 20 cu.m a month get reduced rates and are exempt
        from the FCDA. Ask {c.name} about its lifeline program.
      </Notice>
    </>
  );
}

const s = themed(() => ({
  big: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  bigPrice: { fontSize: 30, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  bigUnit: { fontSize: 15, fontWeight: '400', color: C.muted },
  caption: { color: C.muted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  rowName: { fontSize: 15, fontWeight: '700', color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  rowPrice: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24 },
}));
