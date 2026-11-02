import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { BASKET_ITEMS } from '../lib/basket.ts';
import { fil } from './fil.ts';
import { setLang, t } from './index.ts';
import { filipinoName, itemName } from './items.ts';

const SRC = join(import.meta.dirname, '..');
// The parts of the app that are translated so far.
const TRANSLATED = ['app/index.tsx', 'app/settings.tsx', 'components/TodayView.tsx', 'components/BasketView.tsx',
  'components/FoodView.tsx', 'components/Search.tsx', 'components/bits.tsx', 'components/TodayGadgets.tsx',
  'components/FuelExtras.tsx'];

/** Every t('...') key in the translated screens, ternary branches included. */
function keysUsed(): string[] {
  const out = new Set<string>();
  for (const f of TRANSLATED) {
    const src = readFileSync(join(SRC, f), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*(?:[^'"()]*\?\s*)?(['"])((?:\\.|(?!\1).)*)\1(?:\s*:\s*(['"])((?:\\.|(?!\3).)*)\3)?/g)) {
      out.add(m[2].replace(/\\(.)/g, '$1'));
      if (m[4] !== undefined) out.add(m[4].replace(/\\(.)/g, '$1'));
    }
  }
  return [...out];
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
// Labels the screens pass to t() from tables rather than literals.
const theme = readFileSync(join(SRC, 'theme.ts'), 'utf8');
const settings = readFileSync(join(SRC, 'app/settings.tsx'), 'utf8');
const tableLabels = [
  ...[...theme.slice(theme.indexOf('TAB_LABELS'), theme.indexOf('tabLabel')).matchAll(/: '([^']+)'/g)].map((m) => m[1]),
  ...[...settings.slice(settings.indexOf('SOURCE_LABEL'), settings.indexOf('export default')).matchAll(/\w+: '([^']+)'/g)].map((m) => m[1]),
  ...[...readFileSync(join(SRC, 'components/TodayView.tsx'), 'utf8').matchAll(/fuel_\w+: '([^']+)'/g)].map((m) => m[1]),
];

afterEach(() => setLang('en'));

describe('Filipino', () => {
  it('has every phrase the translated screens use', () => {
    const keys = keysUsed();
    assert.ok(keys.length > 80, `only ${keys.length} keys found`);
    assert.deepEqual(keys.filter((k) => !(k in fil)), []);
  });

  it('has every tab, source and fuel label', () => {
    assert.ok(tableLabels.length > 30);
    setLang('fil');
    assert.deepEqual(tableLabels.filter((k) => t(k) === k && !(k in fil)), []);
  });

  it('keeps the same placeholders', () => {
    const bad = Object.entries(fil).filter(([en, tl]) => placeholders(en).join() !== placeholders(tl).join());
    assert.deepEqual(bad, []);
  });

  it('switches and falls back to English', () => {
    setLang('fil');
    assert.equal(t('Settings'), fil.Settings);
    assert.equal(t('Not a translated phrase'), 'Not a translated phrase');
    assert.equal(t('Gasoline RON 95'), 'Gasolina RON 95');
    assert.equal(t('No food price data covers {place} yet.', { place: 'Pasig' }).includes('Pasig'), true);
  });
});

describe('Filipino item names', () => {
  it('uses the local name DA/PSA give', () => {
    assert.equal(filipinoName('Fish, Round Scad, Galunggong, Medium'), 'Galunggong, medium');
    assert.equal(filipinoName('Fish, Tilapia, Medium'), 'Tilapia, medium');
    assert.equal(filipinoName('Bitter Gourd (ampalaya), Fruit'), 'Ampalaya');
    assert.equal(filipinoName('Sweet Potato (camote), Yellow'), 'Kamote, dilaw');
    assert.equal(filipinoName('Edible Offal, Tripe (tuwalya), Beef'), 'Tuwalya ng baka');
    assert.equal(filipinoName('Crabs, Alimasag, Medium'), 'Alimasag, medium');
    assert.equal(filipinoName('Shells, Tahong'), 'Tahong');
    assert.equal(filipinoName('Squid (Pusit Bisaya)'), 'Pusit Bisaya');
    assert.equal(filipinoName('Cabbage (Rare Ball)'), 'Repolyo (Rare Ball)');
  });

  it('uses everyday words for common items', () => {
    assert.equal(filipinoName('Red Onion'), 'Pulang sibuyas');
    assert.equal(filipinoName('Rice, Well-milled'), 'Bigas, well-milled');
    assert.equal(filipinoName('Egg, Chicken, Medium'), 'Itlog ng manok, medium');
    assert.equal(filipinoName('Edible Offal, Liver, Pork'), 'Atay ng baboy');
    assert.equal(filipinoName('Pork, Kasim'), 'Baboy, kasim');
    assert.equal(filipinoName('Banana, Lakatan, Medium'), 'Saging, lakatan, medium');
  });

  it('leaves unknown names alone', () => {
    assert.equal(filipinoName('Broccoli'), 'Broccoli');
    assert.equal(filipinoName('Beef Sirloin'), 'Beef Sirloin');
  });

  it('names every Basket item', () => {
    assert.deepEqual(BASKET_ITEMS.filter((b) => filipinoName(b.label) === b.label && !/^(galunggong|bangus|tilapia|ampalaya|pechay)$/i.test(b.label)).map((b) => b.label), []);
  });

  it('follows the language setting', () => {
    assert.equal(itemName('Tomato'), 'Tomato');
    setLang('fil');
    assert.equal(itemName('Tomato'), 'Kamatis');
  });
});
