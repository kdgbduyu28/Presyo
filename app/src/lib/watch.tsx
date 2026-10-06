import { createContext, ReactNode, useCallback, useContext, useMemo } from 'react';

import { useStored, WATCH_KEY } from './stored';

type Watch = { keys: string[]; has: (key?: string) => boolean; toggle: (key: string) => void };
const Ctx = createContext<Watch>({ keys: [], has: () => false, toggle: () => {} });

/** Starred items (by catalog key), shared by the Today card and item sheets. */
export function WatchProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useStored<string[]>(WATCH_KEY, []);
  const toggle = useCallback(
    (key: string) => setKeys((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key])),
    [setKeys],
  );
  const value = useMemo(() => ({ keys, has: (k?: string) => !!k && keys.includes(k), toggle }), [keys, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWatch = () => useContext(Ctx);
