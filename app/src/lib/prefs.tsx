import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useStored } from './stored';

/** A city/town the user picked before ("recent places"). */
export type RecentPlace = { code: string; name: string; lat: number; lng: number };

export type Prefs = {
  theme: 'system' | 'light' | 'dark';
  startTab: string;
  hiddenTabs: string[];
  /** Re-locate with GPS on every app open (only if GPS was used before). */
  gpsOnOpen: boolean;
  recent: RecentPlace[];
  /** catalog key of the fuel you buy, shown first on Today */
  fuel: string;
  /** km per liter for the trip calculator */
  kmpl: number;
  /** usual monthly electricity use */
  kwh: number;
  /** distribution utility per PSGC region */
  utility: Record<string, string>;
  lpgBrand: string | null;
  eggs: 'pc' | 'tray';
  /** which variant to favour when an item comes local and imported */
  origin: 'local' | 'imported' | 'any';
  basketKm: number;
  favMarkets: string[];
};

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  startTab: 'today',
  hiddenTabs: [],
  gpsOnOpen: false,
  recent: [],
  fuel: 'fuel_ron91',
  kmpl: 12,
  kwh: 200,
  utility: {},
  lpgBrand: null,
  eggs: 'pc',
  origin: 'local',
  basketKm: 10,
  favMarkets: [],
};

const PREFS_KEY = 'presyo.prefs.v1';
const OLD_UTILITY_KEY = 'presyo.utility.v1';

type Ctx = {
  prefs: Prefs;
  ready: boolean;
  /** Bumped by clearAll; the root remounts on change so in-memory state resets too. */
  epoch: number;
  set: (patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) => void;
  /** Wipe watchlist, basket, last-visit snapshot, offline cache and prefs. */
  clearAll: () => Promise<void>;
};

const PrefsCtx = createContext<Ctx>({
  prefs: DEFAULT_PREFS, ready: false, epoch: 0, set: () => {}, clearAll: async () => {},
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored, ready] = useStored<Partial<Prefs>>(PREFS_KEY, {});
  const [epoch, setEpoch] = useState(0);
  const migrated = useRef(false);
  const prefs = useMemo(() => ({ ...DEFAULT_PREFS, ...stored }), [stored]);

  // One-time move of the utility choice the Electricity tab used to keep on its own.
  useEffect(() => {
    if (!ready || migrated.current) return;
    migrated.current = true;
    AsyncStorage.getItem(OLD_UTILITY_KEY).then((raw) => {
      if (!raw) return;
      setStored((p) => ({ ...p, utility: { ...JSON.parse(raw), ...(p.utility ?? {}) } }));
      AsyncStorage.removeItem(OLD_UTILITY_KEY).catch(() => {});
    }).catch(() => {});
  }, [ready, setStored]);

  const set = useCallback<Ctx['set']>(
    (patch) => setStored((p) => ({ ...p, ...(typeof patch === 'function' ? patch({ ...DEFAULT_PREFS, ...p }) : patch) })),
    [setStored],
  );

  const clearAll = useCallback(async () => {
    const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
    const ours = keys.filter((k) => k.startsWith('presyo.'));
    await AsyncStorage.multiRemove(ours).catch(() => {});
    setStored({});
    setEpoch((e) => e + 1);
  }, [setStored]);

  const value = useMemo(() => ({ prefs, ready, epoch, set, clearAll }), [prefs, ready, epoch, set, clearAll]);
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export const usePrefs = () => useContext(PrefsCtx);

/** Remember a picked place at the front of the recent list (max 5, no dupes). */
export function withRecent(recent: RecentPlace[], place: RecentPlace): RecentPlace[] {
  return [place, ...recent.filter((r) => r.code !== place.code)].slice(0, 5);
}
