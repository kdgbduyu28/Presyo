// English / Filipino. Pure (no RN imports) so it runs under node --test.

import { fil } from './fil.ts';

export type Lang = 'en' | 'fil';

let current: Lang = 'en';

/**
 * Switch languages. Like the theme, call before rendering the tree; the root
 * layout keys the app on the language so every screen re-renders with it.
 */
export function setLang(l: Lang) {
  current = l;
}

export function getLang(): Lang {
  return current;
}

/**
 * Translate by English text. Untranslated strings fall back to English, so new
 * screens work before their Filipino copy is written. `{name}` placeholders are
 * filled from `vars`.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const s = current === 'fil' ? (fil[text] ?? withNumber(text) ?? text) : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Labels with one number baked in ("Gasoline RON 95", "10 km") share an entry written with {n}. */
function withNumber(text: string): string | undefined {
  const nums: string[] = [];
  const key = text.replace(/\d[\d,.]*/g, (m) => (nums.push(m), '{n}'));
  return nums.length === 1 ? fil[key]?.replace('{n}', nums[0]) : undefined;
}
