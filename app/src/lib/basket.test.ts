import assert from 'node:assert/strict';
import { test } from 'node:test';

import { basketFromAverages, basketTotals, priceAt, type LatestItem } from './basket.ts';

const items: LatestItem[] = [
  { key: 'rice_well_milled', origin: 'imported', unit: 'kg', m: { a: 46, b: 47 } },
  { key: 'rice_well_milled', origin: 'local', unit: 'kg', m: { a: 50, c: 52 } },
  { key: 'egg_medium', unit: 'pc', m: { a: [8, 9], b: 8 } },
];
const markets = [
  { id: 'a', name: 'A', lat: 14.6, lng: 121.0 },
  { id: 'b', name: 'B', lat: 14.61, lng: 121.0 },
  { id: 'c', name: 'C', lat: 14.62, lng: 121.0 },
  { id: 'far', name: 'Far', lat: 16.4, lng: 120.6 },
];

test('priceAt prefers local, falls back to imported, ranges use the midpoint', () => {
  assert.equal(priceAt(items, 'rice_well_milled', 'a'), 50);
  assert.equal(priceAt(items, 'rice_well_milled', 'b'), 47);
  assert.equal(priceAt(items, 'egg_medium', 'a'), 8.5);
  assert.equal(priceAt(items, 'egg_medium', 'c'), null);
});

test('basketTotals: complete baskets first, then cheapest; far markets skipped', () => {
  const lines = [{ key: 'rice_well_milled', qty: 5 }, { key: 'egg_medium', qty: 30 }];
  const r = basketTotals(lines, items, markets, 14.6, 121.0, { maxKm: 10 });
  assert.deepEqual(r.map((x) => x.market.id), ['b', 'a', 'c']);
  assert.equal(r[0].total, 47 * 5 + 8 * 30);
  assert.deepEqual(r[2].missing, ['egg_medium']);
});

test('origin preference and favourites', () => {
  assert.equal(priceAt(items, 'rice_well_milled', 'a', 'imported'), 46);
  assert.equal(priceAt(items, 'rice_well_milled', 'a', 'any'), 46); // cheapest
  const lines = [{ key: 'rice_well_milled', qty: 1 }];
  const ids = basketTotals(lines, items, markets, 14.6, 121.0, { maxKm: 1, favourites: ['c'] }).map((x) => x.market.id);
  assert.ok(ids.includes('c') && ids.includes('a') && !ids.includes('far'));
});

test('basketFromAverages', () => {
  assert.deepEqual(basketFromAverages([{ key: 'x', qty: 2 }, { key: 'y', qty: 1 }], { x: 10 }), { total: 20, missing: ['y'] });
});
