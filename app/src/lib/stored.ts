import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

/** useState persisted on the device. `ready` is false until storage was read. */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (raw != null) setValue(JSON.parse(raw) as T);
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        if (loaded.current) AsyncStorage.setItem(key, JSON.stringify(v)).catch(() => {});
        return v;
      });
    },
    [key],
  );

  return [value, set, ready] as const;
}

/** Starred item keys (e.g. "rice_well_milled"), shared app-wide via storage. */
export const WATCH_KEY = 'presyo.watch.v1';
export const SEEN_KEY = 'presyo.seen.v1';
export const BASKET_KEY = 'presyo.basket.v1';
