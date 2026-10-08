import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useJson } from '../lib/data';
import { lastTwo, peso, periodLabel } from '../lib/format';
import { NCR, Place, PlacesFile } from '../lib/places';
import { usePrefs } from '../lib/prefs';
import { C, R, themed } from '../theme';
import { Chart } from './Chart';
import { Card, Delta, Loading, Notice, SectionTitle } from './bits';

type Utility = { id: string; name?: string; type?: string; s: (number | null)[] };
type PowerFile = { periods: string[]; utilities: Utility[] };

// Meralco's franchise also covers parts of Central Luzon and CALABARZON.
const MERALCO_REGIONS = new Set([NCR, '030000000', '040000000']);
const TYPE_LABEL: Record<string, string> = { PIOU: 'Private utility', EC: 'Electric cooperative' };

/** Residential electricity rate of your distribution utility (DOE monthly). */
export function PowerView({ place, places }: { place: Place; places: PlacesFile }) {
  const own = useJson<PowerFile>(`power/${place.region}.json`);
  const ncr = useJson<PowerFile>(MERALCO_REGIONS.has(place.region) && place.region !== NCR ? `power/${NCR}.json` : null);
  const { prefs, set } = usePrefs();
  const choice = prefs.utility;
  const [kwh, setKwhText] = useState(String(prefs.kwh));
  const setKwh = (t: string) => {
    setKwhText(t);
    if (parseFloat(t) > 0) set({ kwh: parseFloat(t) }); // remembered in Settings
  };

  const file = useMemo(() => {
    if (!own.data) return null;
    const extra = ncr.data?.utilities.filter((u) => u.id === 'MERALCO') ?? [];
    return { periods: own.data.periods, utilities: [...extra, ...own.data.utilities] };
  }, [own.data, ncr.data]);

  if (own.loading) return <Loading />;
  if (!file?.utilities.length) return <Notice tone="warn">No electricity rates for this region yet.</Notice>;

  const latest = (u: Utility) => lastTwo(u.s);
  const ranked = file.utilities
    .map((u) => ({ u, ...latest(u) }))
    .filter((x) => x.last != null)
    .sort((a, b) => (a.last as number) - (b.last as number));
  const chosenId = choice[place.region] ?? (MERALCO_REGIONS.has(place.region) ? 'MERALCO' : null);
  const chosen = ranked.find((x) => x.u.id === chosenId);
  const pick = (id: string) => set((p) => ({ utility: { ...p.utility, [place.region]: id } }));
  const region = places.names[place.region] ?? '';
  const k = parseFloat(kwh);

  return (
    <View>
      {chosen ? (
        <>
          <SectionTitle>Your utility · {periodLabel(file.periods[chosen.lastIdx])}</SectionTitle>
          <Card style={{ padding: 16 }}>
            <Text style={s.du}>{chosen.u.name ?? chosen.u.id}</Text>
            <Text style={s.duType}>{TYPE_LABEL[chosen.u.type ?? ''] ?? chosen.u.type}</Text>
            <View style={s.big}>
              <Text style={s.bigPrice}>{peso(chosen.last as number)}<Text style={s.bigUnit}>/kWh</Text></Text>
              <Delta last={chosen.last} prev={chosen.prev} />
            </View>
            <Text style={s.caption}>Residential rate, all charges · vs previous month</Text>
            <View style={s.bill}>
              <Text style={s.billLabel}>Monthly use</Text>
              <TextInput value={kwh} onChangeText={setKwh} keyboardType="number-pad" style={s.input}
                accessibilityLabel="Monthly use in kWh" selectTextOnFocus />
              <Text style={s.billLabel}>kWh  ≈</Text>
              <Text style={s.billValue}>{k > 0 ? peso(k * (chosen.last as number)) : '—'}</Text>
            </View>
            <Text style={s.caption}>Check “kWh used” on your bill. A typical home uses 150–250 kWh a month.</Text>
            <View style={{ marginTop: 14 }}>
              <Chart periods={file.periods} values={chosen.u.s} height={130} />
            </View>
          </Card>
        </>
      ) : (
        <Notice>Pick your electric utility below. It's printed at the top of your bill.</Notice>
      )}

      <SectionTitle>{region} utilities · lowest rate first</SectionTitle>
      <Card>
        {ranked.map(({ u, last, prev, lastIdx }) => (
          <Pressable key={u.id} onPress={() => pick(u.id)} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.bg }]}
            accessibilityRole="button" accessibilityState={{ selected: u.id === chosenId }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowName, u.id === chosenId && { color: C.primary }]}>
                {u.id === chosenId ? '● ' : ''}{u.id}
              </Text>
              <Text style={s.rowSub} numberOfLines={1}>
                {[u.name && u.name !== u.id ? u.name : null, TYPE_LABEL[u.type ?? ''] ?? u.type,
                  periodLabel(file.periods[lastIdx])].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.rowPrice}>{peso(last as number)}<Text style={s.unit}>/kWh</Text></Text>
              <Delta last={last} prev={prev} small />
            </View>
          </Pressable>
        ))}
      </Card>
      <Text style={s.source}>DOE electricity rates per distribution utility (residential). Tap a utility to make it yours.</Text>
    </View>
  );
}

const s = themed(() => ({
  du: { fontSize: 18, fontWeight: '800', color: C.text },
  duType: { fontSize: 13, color: C.muted, marginBottom: 8 },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  bigPrice: { fontSize: 30, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  bigUnit: { fontSize: 15, fontWeight: '400', color: C.muted },
  caption: { color: C.muted, fontSize: 13, marginTop: 2 },
  bill: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  billLabel: { fontSize: 14, color: C.muted },
  billValue: { fontSize: 20, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
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
  rowPrice: { fontSize: 15, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, fontWeight: '400', color: C.muted },
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24 },
}));
