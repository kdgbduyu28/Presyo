import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { Market, PlacesFile } from './places';
import type { Price } from './format';

// The ingest publishes plain JSON next to the web app. Native builds fetch it
// from the deployed site.
const BASE =
  process.env.EXPO_PUBLIC_DATA_URL ?? (Platform.OS === 'web' ? '/data' : 'https://presyo.pages.dev/data');

export type SeriesItem = {
  cat: string;
  item: string;
  unit: string;
  spec?: string;
  origin?: 'local' | 'imported';
  key?: string;
  s: Price[];
};
export type SeriesFile = { periods: string[]; items: SeriesItem[] };

export type FuelRow = { key: string; brand?: string; p: Price };
export type FuelFile = { weeks: { start: string; end: string; rows: FuelRow[] }[] };

export type LpgFile = { months: { start: string; end: string; rows: { brand?: string; p: Price }[] }[] };
export type LpgMonthly = { periods: string[]; s: [number, number][] };

export type AdjustWeek = {
  start: string;
  end: string;
  status: 'ok' | 'partial';
  products: Record<string, { median: number; min: number; max: number; n: number }>;
  companies: { name: string; gasoline?: number; diesel?: number; kerosene?: number }[];
};
export type AdjustFile = { weeks: AdjustWeek[] };

export type SummaryItem = {
  key: string; item: string; unit: string; cat: string; origin?: string;
  last: Price; period: string; prev?: Price; prev_period?: string; spark: Price[];
};
export type SummaryFile = { source: 'psa' | 'da_index'; items: SummaryItem[] };

export type LatestFile = {
  date: string;
  items: (Omit<SeriesItem, 's'> & { m: Record<string, Price> })[];
};

export type Meta = {
  generated_at: string;
  tabs: string[];
  sources: Record<string, { latest: string; places?: number }>;
};

export type { Market, PlacesFile };

const cache = new Map<string, Promise<unknown>>();

// Files the home screen needs, kept on the device so the app still opens
// (with the last prices) without a connection. Small files only.
const OFFLINE = /^(places|markets|meta)\.json$|^(summary|fuel|lpg|power)\/|^da\/latest\.json$|^grocery\//;
const OFFLINE_MAX = 250_000;

async function remember(path: string, body: string) {
  if (OFFLINE.test(path) && body.length <= OFFLINE_MAX) {
    await AsyncStorage.setItem(`presyo.cache.${path}`, body).catch(() => {});
  }
}

export function load<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`${BASE}/${path}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${path}`);
        const body = await r.text();
        remember(path, body);
        return JSON.parse(body);
      })
      .catch(async (e) => {
        const saved = OFFLINE.test(path) ? await AsyncStorage.getItem(`presyo.cache.${path}`).catch(() => null) : null;
        if (saved) return JSON.parse(saved);
        throw e;
      });
    p.catch(() => cache.delete(path)); // let a later render retry
    cache.set(path, p);
  }
  return p as Promise<T>;
}

export type Loaded<T> = { data?: T; error?: string; loading: boolean };

/** Fetch one JSON file; `null` path = nothing to load. */
export function useJson<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<Loaded<T> & { path: string | null }>({ loading: path != null, path });
  useEffect(() => {
    if (path == null) {
      setState({ loading: false, path });
      return;
    }
    let live = true;
    setState({ loading: true, path });
    load<T>(path).then(
      (data) => live && setState({ data, loading: false, path }),
      (e: Error) => live && setState({ error: e.message, loading: false, path }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  // Until the effect catches up with a new path, report it as loading
  // (otherwise callers flash "no results" for one render).
  if (state.path !== path) return { loading: path != null };
  return state;
}
