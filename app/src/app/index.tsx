import { Stack } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips, Loading, Notice } from '../components/bits';
import { BasketView } from '../components/BasketView';
import { FoodView } from '../components/FoodView';
import { GroceryView } from '../components/GroceryView';
import { PowerView } from '../components/PowerView';
import { FuelView } from '../components/FuelView';
import { LocationPicker } from '../components/LocationPicker';
import { Sheet } from '../components/Sheet';
import { TodayView } from '../components/TodayView';
import { Market, Meta, PlacesFile, useJson } from '../lib/data';
import { periodLabel } from '../lib/format';
import { useSpot } from '../lib/location';
import { placeName } from '../lib/names';
import { nearestPlace } from '../lib/places';
import { C, MAX_WIDTH, TAB_LABELS } from '../theme';

const TABS = ['today', 'basket', 'rice', 'fuel', 'meat', 'vegetables', 'seafood', 'fruits', 'pantry', 'grocery', 'power'] as const;
type Tab = (typeof TABS)[number];

export default function Home() {
  const insets = useSafeAreaInsets();
  const [spot, setSpot] = useSpot();
  const [tab, setTab] = useState<Tab>('today');
  const scroller = useRef<ScrollView>(null);
  const openTab = (t: string) => {
    setTab(t as Tab);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };
  const [picking, setPicking] = useState(false);
  const places = useJson<PlacesFile>('places.json');
  const markets = useJson<Market[]>('markets.json');
  const meta = useJson<Meta>('meta.json');

  const here = useMemo(
    () => (spot && places.data ? nearestPlace(places.data.rows, spot.lat, spot.lng)?.place ?? null : null),
    [spot, places.data],
  );

  const ready = places.data && markets.data && spot !== undefined;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ title: 'Presyo' }} />
      <View style={s.column}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.brand}>Presyo</Text>
            <Text style={s.tagline}>Palengke & pump prices near you</Text>
          </View>
          {here && places.data ? (
            <Pressable onPress={() => setPicking(true)} style={s.loc} accessibilityRole="button"
              accessibilityLabel={`Location: ${placeName(here, places.data)}. Change`}>
              <Text style={s.locText} numberOfLines={1}>📍 {placeName(here, places.data, { short: true })}</Text>
              <Text style={s.locChange}>Change</Text>
            </Pressable>
          ) : null}
        </View>

        {!ready ? (
          places.error ? <Notice tone="warn">Couldn't load data: {places.error}</Notice> : <Loading />
        ) : spot === null || !here ? (
          <ScrollView contentContainerStyle={s.onboard}>
            <Text style={s.h1}>Where do you buy?</Text>
            <Text style={s.lead}>
              Presyo shows the latest government-monitored prices of rice, fuel, meat, vegetables and
              seafood for your area.
            </Text>
            <LocationPicker places={places.data!} onPick={setSpot} />
          </ScrollView>
        ) : (
          <>
            <Chips
              options={TABS.map((t) => ({ id: t, label: TAB_LABELS[t] }))}
              value={tab}
              onChange={openTab}
            />
            <ScrollView ref={scroller} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
              {tab === 'today' ? (
                <TodayView place={here} spot={spot} places={places.data!} markets={markets.data!} onOpenTab={openTab} />
              ) : tab === 'basket' ? (
                <BasketView place={here} spot={spot} places={places.data!} markets={markets.data!} />
              ) : tab === 'grocery' ? (
                <GroceryView />
              ) : tab === 'power' ? (
                <PowerView place={here} places={places.data!} />
              ) : tab === 'fuel' ? (
                <FuelView place={here} spot={spot} places={places.data!} />
              ) : (
                <FoodView cat={tab} place={here} spot={spot} places={places.data!} markets={markets.data!} />
              )}
              <Text style={s.footer}>
                Data from DA Bantay Presyo, PSA OpenSTAT, DOE (pump prices, LPG, price notices, electricity) and DTI (SRP)
                {meta.data ? ` · updated ${periodLabel(meta.data.generated_at.slice(0, 10))}` : ''}.
                Presyo is not affiliated with the government.
              </Text>
            </ScrollView>
          </>
        )}
      </View>

      {places.data ? (
        <Sheet open={picking} onClose={() => setPicking(false)} title="Change location">
          <LocationPicker places={places.data} onPick={(sp) => { setSpot(sp); setPicking(false); }} />
        </Sheet>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  brand: { fontSize: 26, fontWeight: '800', color: C.primary, letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: C.muted },
  loc: {
    backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 200,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, alignItems: 'flex-end',
  },
  locText: { fontSize: 14, fontWeight: '600', color: C.text },
  locChange: { fontSize: 12, color: C.primary, fontWeight: '600' },
  onboard: { padding: 16 },
  h1: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 8 },
  lead: { fontSize: 15, color: C.muted, lineHeight: 21, marginBottom: 20 },
  footer: { fontSize: 12, color: C.faint, marginHorizontal: 16, lineHeight: 17 },
});
