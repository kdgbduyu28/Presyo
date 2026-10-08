import { router } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Market, Meta, useJson } from '../lib/data';
import { periodLabel } from '../lib/format';
import { Prefs, usePrefs } from '../lib/prefs';
import { C, MAX_WIDTH, R, TAB_LABELS, themed } from '../theme';

const TAB_IDS = ['today', 'basket', 'rice', 'fuel', 'meat', 'vegetables', 'seafood', 'fruits', 'pantry', 'grocery', 'power'];

const FUELS: [string, string][] = [
  ['fuel_ron91', 'RON 91'], ['fuel_ron95', 'RON 95'], ['fuel_ron97', 'RON 97'],
  ['fuel_ron100', 'RON 100'], ['fuel_diesel', 'Diesel'], ['fuel_diesel_plus', 'Diesel Plus'],
];

const LPG_BRANDS = ['Gasul', 'Solane', 'Fiesta Gas', 'Pryce Gas', 'Regasco', 'Island Gas',
  'Phoenix', 'Brent Gas', 'Superkalan', 'Shinegaz', 'Eco-Savers Gas'];

const SOURCE_LABEL: Record<string, string> = {
  da_index: 'DA daily price index (NCR)', da_market: 'DA per-market prices (NCR)', psa: 'PSA regional retail prices',
  doe_ncr: 'DOE pump prices: NCR', doe_south_luzon: 'DOE pump prices: South Luzon',
  doe_north_luzon: 'DOE pump prices: North Luzon', doe_visayas: 'DOE pump prices: Visayas',
  doe_mindanao: 'DOE pump prices: Mindanao', doe_lpg: 'DOE LPG', doe_power: 'DOE electricity rates',
  dti_srp: 'DTI suggested retail prices',
};

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { prefs, set, clearAll } = usePrefs();
  const markets = useJson<Market[]>('markets.json');
  const meta = useJson<Meta>('meta.json');
  const [confirmClear, setConfirmClear] = useState(false);

  const toggle = <K extends keyof Prefs>(key: K, value: string) =>
    set((p) => {
      const list = p[key] as unknown as string[];
      return { [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] } as Partial<Prefs>;
    });

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.column}>
        <View style={s.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}
            accessibilityRole="button" accessibilityLabel="Back">
            <Text style={s.back}>‹ Back</Text>
          </Pressable>
          <Text style={s.title}>Settings</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <Section title="Appearance">
            <Segmented
              value={prefs.theme}
              options={[['system', 'Follow phone'], ['light', 'Light'], ['dark', 'Dark']]}
              onChange={(theme) => set({ theme: theme as Prefs['theme'] })}
            />
          </Section>

          <Section title="Location">
            <Row label="Use GPS every time I open Presyo"
              hint="Only after you've used “Use my location” once. Otherwise your chosen city stays.">
              <Switch value={prefs.gpsOnOpen} onValueChange={(gpsOnOpen) => set({ gpsOnOpen })}
                trackColor={{ true: C.primary, false: C.faint }} thumbColor={C.card} />
            </Row>
            {prefs.recent.length ? (
              <Row label={`Recent places: ${prefs.recent.map((r) => r.name).join(', ')}`}>
                <Pressable onPress={() => set({ recent: [] })} accessibilityRole="button">
                  <Text style={s.link}>Clear</Text>
                </Pressable>
              </Row>
            ) : null}
          </Section>

          <Section title="Start on">
            <Chips value={prefs.startTab} options={TAB_IDS.filter((t) => !prefs.hiddenTabs.includes(t)).map((t) => [t, TAB_LABELS[t]])}
              onChange={(startTab) => set({ startTab })} />
          </Section>

          <Section title="Tabs" hint="Hide the tabs you never use.">
            {TAB_IDS.filter((t) => t !== 'today').map((t) => (
              <Row key={t} label={TAB_LABELS[t]}>
                <Switch value={!prefs.hiddenTabs.includes(t)} onValueChange={() => toggle('hiddenTabs', t)}
                  trackColor={{ true: C.primary, false: C.faint }} thumbColor={C.card}
                  accessibilityLabel={`Show ${TAB_LABELS[t]} tab`} />
              </Row>
            ))}
          </Section>

          <Section title="Fuel" hint="Your fuel shows first on Today; mileage fills the trip calculator.">
            <Chips value={prefs.fuel} options={FUELS} onChange={(fuel) => set({ fuel })} />
            <Row label="Mileage (km per liter)">
              <NumberField value={prefs.kmpl} onChange={(kmpl) => set({ kmpl })} />
            </Row>
          </Section>

          <Section title="Electricity" hint="Pick your utility in the Electricity tab.">
            <Row label="Usual monthly use (kWh)">
              <NumberField value={prefs.kwh} onChange={(kwh) => set({ kwh })} />
            </Row>
          </Section>

          <Section title="LPG brand" hint="Today shows this brand's price when DOE lists it near you.">
            <Chips value={prefs.lpgBrand ?? ''} options={[['', 'Any (common price)'], ...LPG_BRANDS.map((b) => [b, b] as [string, string])]}
              onChange={(b) => set({ lpgBrand: b || null })} />
          </Section>

          <Section title="Eggs">
            <Segmented value={prefs.eggs} options={[['pc', 'Per piece'], ['tray', 'Per tray (30)']]}
              onChange={(eggs) => set({ eggs: eggs as Prefs['eggs'] })} />
          </Section>

          <Section title="Local or imported" hint="Used for the Basket and to list your choice first.">
            <Segmented value={prefs.origin} options={[['local', 'Local'], ['imported', 'Imported'], ['any', 'Cheapest']]}
              onChange={(origin) => set({ origin: origin as Prefs['origin'] })} />
          </Section>

          <Section title="Basket" hint="Markets within this distance are compared; favourites always are.">
            <Chips value={String(prefs.basketKm)} options={[5, 10, 15, 20, 30].map((k) => [String(k), `${k} km`] as [string, string])}
              onChange={(k) => set({ basketKm: Number(k) })} />
            <Text style={s.sub}>Favourite markets (Metro Manila)</Text>
            {(markets.data ?? []).map((m) => (
              <Row key={m.id} label={m.name.split('/')[0]}>
                <Switch value={prefs.favMarkets.includes(m.id)} onValueChange={() => toggle('favMarkets', m.id)}
                  trackColor={{ true: C.star, false: C.faint }} thumbColor={C.card}
                  accessibilityLabel={`Favourite ${m.name}`} />
              </Row>
            ))}
          </Section>

          <Section title="Data">
            {meta.data ? Object.entries(meta.data.sources).map(([k, v]) => (
              <Row key={k} label={SOURCE_LABEL[k] ?? k}>
                <Text style={s.value}>{periodLabel(v.latest)}</Text>
              </Row>
            )) : null}
            <Pressable
              onPress={async () => {
                if (!confirmClear) return setConfirmClear(true);
                await clearAll();
                router.replace('/');
              }}
              style={[s.danger, confirmClear && s.dangerOn]}
              accessibilityRole="button"
            >
              <Text style={[s.dangerText, confirmClear && { color: C.onPrimary }]}>
                {confirmClear ? 'Tap again to erase everything' : 'Clear saved data'}
              </Text>
            </Pressable>
            <Text style={s.hint}>
              Removes your location, starred items, basket, settings and offline copy from this device.
              Nothing is stored anywhere else.
            </Text>
          </Section>

          <Text style={s.about}>
            Presyo shows prices published by DA (Bantay Presyo), PSA (OpenSTAT), DOE and DTI. It is not
            affiliated with the government. Data updates twice a day.
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      <View style={s.card}>{children}</View>
    </View>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{label}</Text>
        {hint ? <Text style={s.rowHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Segmented({ value, options, onChange }: {
  value: string; options: [string, string][]; onChange: (v: string) => void;
}) {
  return (
    <View style={s.segment}>
      {options.map(([id, label]) => {
        const on = id === value;
        return (
          <Pressable key={id} onPress={() => onChange(id)} style={[s.segItem, on && s.segOn]}
            accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[s.segText, on && s.segTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Chips({ value, options, onChange }: {
  value: string; options: [string, string][]; onChange: (v: string) => void;
}) {
  return (
    <View style={s.chips}>
      {options.map(([id, label]) => {
        const on = id === value;
        return (
          <Pressable key={id} onPress={() => onChange(id)} style={[s.chip, on && s.chipOn]}
            accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && s.segTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NumberField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <TextInput
      value={text}
      onChangeText={(t) => {
        setText(t);
        const n = parseFloat(t);
        if (n > 0) onChange(n);
      }}
      keyboardType="decimal-pad"
      style={s.input}
      selectTextOnFocus
    />
  );
}

const s = themed(() => ({
  screen: { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: C.primary, fontSize: 16, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', color: C.text },
  section: { marginHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 18 },
  sub: { fontSize: 13, fontWeight: '700', color: C.muted, marginTop: 14, marginBottom: 4 },
  card: {
    backgroundColor: C.card, borderRadius: R.xl, marginTop: 8, padding: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.line,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  label: { fontSize: 15, color: C.text },
  rowHint: { fontSize: 12, color: C.muted, marginTop: 2 },
  value: { fontSize: 14, color: C.muted },
  link: { color: C.primary, fontWeight: '600' },
  segment: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: R.lg, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: R.md, alignItems: 'center' },
  segOn: { backgroundColor: C.primary },
  segText: { fontSize: 14, fontWeight: '600', color: C.text },
  segTextOn: { color: C.onPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: R.pill, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: C.text },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 16, color: C.text, backgroundColor: C.bg, width: 80, textAlign: 'right',
  },
  danger: { marginTop: 12, borderWidth: 1, borderColor: C.up, borderRadius: R.lg, paddingVertical: 10, alignItems: 'center' },
  dangerOn: { backgroundColor: C.up },
  dangerText: { color: C.up, fontWeight: '700' },
  about: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginTop: 20, lineHeight: 17 },
}));
