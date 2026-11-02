import assert from 'node:assert/strict';
import { test } from 'node:test';

import { basketFromAverages, basketHistory, basketTotals, pickVariant, priceAt, weekOf, type LatestItem } from './basket.ts';

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

test('pickVariant follows the local / imported / cheapest setting', () => {
  const rice = { key: 'rice', origin: 'local', last: 50,
    variants: [{ key: 'rice', origin: 'imported', last: 46 }] };
  assert.equal(pickVariant(rice, 'local').last, 50);
  assert.equal(pickVariant(rice, 'imported').last, 46);
  assert.equal(pickVariant(rice, 'any').last, 46);
  assert.equal(pickVariant(rice, 'imported').variants, undefined);
  const egg = { key: 'egg', last: 8 };
  assert.equal(pickVariant(egg, 'imported'), egg);
});

test('weekOf: Monday of the week', () => {
  assert.equal(weekOf('2026-10-19'), '2026-10-19'); // Monday
  assert.equal(weekOf('2026-10-25'), '2026-10-19'); // Sunday
  assert.equal(weekOf('2026-10-22'), '2026-10-19');
});

test('basketHistory: last report of each week, gaps carried over, variant rule', () => {
  const periods = ['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-26'];
  const hist = [
    { key: 'rice', origin: 'local', s: [50, 51, null, 52, 53] },
    { key: 'rice', origin: 'imported', s: [45, 45, 45, 45, 45] },
    { key: 'egg', s: [8, null, null, null, 9] },
  ];
  const lines = [{ key: 'rice', qty: 2 }, { key: 'egg', qty: 10 }];
  assert.deepEqual(basketHistory(lines, hist, periods), [
    { period: '2026-10-12', total: 51 * 2 + 80, missing: [] },
    { period: '2026-10-19', total: 52 * 2 + 80, missing: [] }, // egg carried from Oct 12
    { period: '2026-10-26', total: 53 * 2 + 90, missing: [] },
  ]);
  assert.equal(basketHistory(lines, hist, periods, { origin: 'imported' })[0].total, 45 * 2 + 80);
  assert.equal(basketHistory(lines, hist, periods, { count: 1 }).length, 1);
  // months (PSA) and items with no history
  const months = basketHistory([...lines, { key: 'fish', qty: 1 }], hist.slice(0, 1), ['2026-08', '2026-09'], { by: 'month' });
  assert.deepEqual(months.map((p) => [p.period, p.total, p.missing]), [['2026-08', 100, ['egg', 'fish']], ['2026-09', 102, ['egg', 'fish']]]);
});
