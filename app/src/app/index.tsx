import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BasketView } from '../components/BasketView';
import { Chips, Loading, Notice } from '../components/bits';
import { FoodView } from '../components/FoodView';
import { FuelView } from '../components/FuelView';
import { GroceryView } from '../components/GroceryView';
import { LocationPicker } from '../components/LocationPicker';
import { PowerView } from '../components/PowerView';
import { Sheet } from '../components/Sheet';
import { TodayView } from '../components/TodayView';
import { Market, Meta, PlacesFile, useJson } from '../lib/data';
import { periodLabel } from '../lib/format';
import { locate, Spot, useSpot } from '../lib/location';
import { placeName } from '../lib/names';
import { nearestPlace } from '../lib/places';
import { usePrefs, withRecent } from '../lib/prefs';
import { C, MAX_WIDTH, R, TAB_LABELS, themed, WIDE } from '../theme';

const TABS = ['today', 'basket', 'rice', 'fuel', 'meat', 'vegetables', 'seafood', 'fruits', 'pantry', 'grocery', 'power'] as const;
type Tab = (typeof TABS)[number];

// Survive the remount that a theme change or "clear data" does.
let lastTab: Tab | null = null;
let gpsRefreshed = false;

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const { prefs, set } = usePrefs();
  const [spot, setSpot] = useSpot();
  const tabs = TABS.filter((t) => t === 'today' || !prefs.hiddenTabs.includes(t));
  const start = (tabs as readonly string[]).includes(prefs.startTab) ? (prefs.startTab as Tab) : 'today';
  const [tabState, setTab] = useState<Tab>(lastTab ?? start);
  const tab = tabs.includes(tabState) ? tabState : 'today';
  const scroller = useRef<ScrollView>(null);
  const openTab = (t: string) => {
    lastTab = t as Tab;
    setTab(t as Tab);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };
  const [picking, setPicking] = useState(false);
  const places = useJson<PlacesFile>('places.json');
  const markets = useJson<Market[]>('markets.json');
  const meta = useJson<Meta>('meta.json');

  // "Use GPS every time I open": refresh once per app launch, quietly.
  useEffect(() => {
    if (gpsRefreshed || !prefs.gpsOnOpen || spot?.via !== 'gps') return;
    gpsRefreshed = true;
    locate().then(setSpot, () => {});
  }, [prefs.gpsOnOpen, spot, setSpot]);

  const here = useMemo(
    () => (spot && places.data ? nearestPlace(places.data.rows, spot.lat, spot.lng)?.place ?? null : null),
    [spot, places.data],
  );

  const pick = (sp: Spot, label?: { code: string; name: string }) => {
    setSpot(sp);
    setPicking(false);
    if (label) set((p) => ({ recent: withRecent(p.recent, { ...label, lat: sp.lat, lng: sp.lng }) }));
  };

  const ready = places.data && markets.data && spot !== undefined;

  const content = ready && spot && here ? (
    <ScrollView ref={scroller} contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: wide ? 16 : 0 }}>
      {tab === 'today' ? (
        <TodayView place={here} spot={spot} places={places.data!} markets={markets.data!} onOpenTab={openTab} wide={wide} />
      ) : tab === 'basket' ? (
        <BasketView place={here} spot={spot} places={places.data!} markets={markets.data!} wide={wide} />
      ) : tab === 'grocery' ? (
        <GroceryView />
      ) : tab === 'power' ? (
        <PowerView place={here} places={places.data!} />
      ) : tab === 'fuel' ? (
        <FuelView place={here} spot={spot} places={places.data!} wide={wide} />
      ) : (
        <FoodView cat={tab} place={here} spot={spot} places={places.data!} markets={markets.data!} />
      )}
      <Text style={s.footer}>
        Data from DA Bantay Presyo, PSA OpenSTAT, DOE (pump prices, LPG, price notices, electricity) and DTI (SRP)
        {meta.data ? ` · updated ${periodLabel(meta.data.generated_at.slice(0, 10))}` : ''}.
        Presyo is not affiliated with the government.
      </Text>
    </ScrollView>
  ) : null;

  const onboarding = (
    <ScrollView contentContainerStyle={s.onboard}>
      <Text style={s.h1}>Where do you buy?</Text>
      <Text style={s.lead}>
        Presyo shows the latest government-monitored prices of rice, fuel, meat, vegetables, seafood,
        groceries, LPG and electricity for your area.
      </Text>
      {places.data ? <LocationPicker places={places.data} onPick={pick} recent={prefs.recent} /> : null}
    </ScrollView>
  );

  const body = !ready
    ? (places.error ? <Notice tone="warn">Couldn't load data: {places.error}</Notice> : <Loading />)
    : content ?? onboarding;

  const locationButton = here && places.data ? (
    <Pressable onPress={() => setPicking(true)} style={[s.loc, wide && s.locWide]} accessibilityRole="button"
      accessibilityLabel={`Location: ${placeName(here, places.data)}. Change`}>
      <Text style={s.locText} numberOfLines={1}>📍 {placeName(here, places.data, { short: true })}</Text>
      <Text style={s.locChange}>Change</Text>
    </Pressable>
  ) : null;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ title: 'Presyo' }} />
      {wide ? (
        <View style={s.wideRow}>
          <View style={s.sidebar}>
            <Text style={s.brand}>Presyo</Text>
            <Text style={s.tagline}>Palengke & pump prices near you</Text>
            <View style={{ height: 16 }} />
            {locationButton}
            <View style={{ height: 12 }} />
            {content ? tabs.map((t) => {
              const on = t === tab;
              return (
                <Pressable key={t} onPress={() => openTab(t)} style={[s.nav, on && s.navOn]}
                  accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[s.navText, on && s.navTextOn]}>{TAB_LABELS[t]}</Text>
                </Pressable>
              );
            }) : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => router.push('/settings')} style={s.nav} accessibilityRole="button">
              <Text style={s.navText}>⚙︎  Settings</Text>
            </Pressable>
          </View>
          <View style={s.wideMain}>{body}</View>
        </View>
      ) : (
        <View style={s.column}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.brand}>Presyo</Text>
              <Text style={s.tagline}>Palengke & pump prices near you</Text>
            </View>
            {locationButton}
            <Pressable onPress={() => router.push('/settings')} style={s.gear} hitSlop={8}
              accessibilityRole="button" accessibilityLabel="Settings">
              <Text style={s.gearText}>⚙︎</Text>
            </Pressable>
          </View>
          {content ? (
            <Chips options={tabs.map((t) => ({ id: t, label: TAB_LABELS[t] }))} value={tab} onChange={openTab} />
          ) : null}
          {body}
        </View>
      )}

      {places.data ? (
        <Sheet open={picking} onClose={() => setPicking(false)} title="Change location">
          <LocationPicker places={places.data} onPick={pick} recent={prefs.recent} />
        </Sheet>
      ) : null}
    </View>
  );
}

const s = themed(() => ({
  screen: { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  brand: { fontSize: 26, fontWeight: '800', color: C.primary, letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: C.muted },
  loc: {
    backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 200,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, alignItems: 'flex-end',
  },
  locWide: { maxWidth: undefined, alignItems: 'flex-start' },
  locText: { fontSize: 14, fontWeight: '600', color: C.text },
  locChange: { fontSize: 12, color: C.primary, fontWeight: '600' },
  gear: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line,
  },
  gearText: { fontSize: 20, color: C.text },
  onboard: { padding: 16, maxWidth: MAX_WIDTH, width: '100%', alignSelf: 'center' },
  h1: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 8 },
  lead: { fontSize: 15, color: C.muted, lineHeight: 21, marginBottom: 20 },
  footer: { fontSize: 12, color: C.faint, marginHorizontal: 16, lineHeight: 17 },
  // wide screens: sidebar + main area
  wideRow: { flex: 1, flexDirection: 'row', width: '100%', maxWidth: 1400 },
  sidebar: {
    width: 248, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.line,
  },
  wideMain: { flex: 1 },
  nav: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: R.lg, marginBottom: 2 },
  navOn: { backgroundColor: C.primarySoft },
  navText: { fontSize: 15, fontWeight: '600', color: C.text },
  navTextOn: { color: C.primary },
}));
