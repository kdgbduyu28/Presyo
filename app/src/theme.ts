import { StyleSheet } from 'react-native';

export type Scheme = 'light' | 'dark';

const light = {
  primary: '#15803D',
  primaryDark: '#166534',
  primarySoft: '#ECFDF3',
  onPrimary: '#FFFFFF',
  bg: '#F5F5F0',
  card: '#FFFFFF',
  text: '#1C1F1A',
  muted: '#6B6F66',
  faint: '#A3A69E',
  line: '#E8E8E2',
  up: '#DC2626', // price went up: bad for shoppers
  upBg: '#FEF2F2',
  down: '#15803D',
  downBg: '#ECFDF3',
  warn: '#B45309',
  warnBg: '#FFFBEB',
  star: '#D97706',
  overlay: 'rgba(0,0,0,0.45)',
  // categorical series (store lines), fixed order; validated vs the card surface
  s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s4: '#eda100', s5: '#e87ba4',
};

export type Palette = typeof light;

const dark: Palette = {
  primary: '#4ADE80',
  primaryDark: '#86EFAC',
  primarySoft: '#13261A',
  onPrimary: '#0B1A10',
  bg: '#0F1110',
  card: '#191C1A',
  text: '#ECEEE9',
  muted: '#A1A69C',
  faint: '#6E736A',
  line: '#2A2E2B',
  up: '#F87171',
  upBg: '#2A1515',
  down: '#4ADE80',
  downBg: '#13261A',
  warn: '#FBBF24',
  warnBg: '#2A2210',
  star: '#FBBF24',
  overlay: 'rgba(0,0,0,0.6)',
  s1: '#3987e5', s2: '#d95926', s3: '#199e70', s4: '#c98500', s5: '#d55181',
};

const palettes: Record<Scheme, Palette> = { light, dark };
let current: Scheme = 'light';

/** Switch palettes. The root layout calls this and remounts the tree, so
 *  every `C.x` and `themed()` style is read again with the new colors. */
export function setScheme(scheme: Scheme) {
  current = scheme;
}

export function getScheme(): Scheme {
  return current;
}

/** Colors of the active palette (read at render time). */
export const C: Palette = new Proxy({} as Palette, {
  get: (_, key) => palettes[current][key as keyof Palette],
});

/** StyleSheet whose colors follow the active palette: `fn` runs once per palette. */
export function themed<T extends StyleSheet.NamedStyles<T>>(fn: () => T): T {
  const cache: Partial<Record<Scheme, T>> = {};
  return new Proxy({} as T, {
    get: (_, key) => (cache[current] ??= StyleSheet.create(fn()))[key as keyof T],
  });
}

export const R = { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 };

/** Single-column width on phones; wide screens get a sidebar + two columns. */
export const MAX_WIDTH = 720;
export const WIDE = 1024;

export const TAB_LABELS: Record<string, string> = {
  today: 'Today',
  basket: 'Basket',
  fruits: 'Fruits',
  pantry: 'Pantry',
  grocery: 'Grocery SRP',
  power: 'Electricity',
  water: 'Water',
  fares: 'Fares',
  forex: 'Forex',
  gadgets: 'Gadgets',
  rice: 'Rice',
  fuel: 'Fuel',
  meat: 'Meat & Eggs',
  vegetables: 'Vegetables',
  seafood: 'Seafood',
};
