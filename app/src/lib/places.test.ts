import assert from 'node:assert/strict';
import { test } from 'node:test';

import { foodSource, fuelArea, km, nearestMarkets, nearestPlace, searchPlaces, toPlace, type PlaceRow, type PlacesFile } from './places.ts';
import { change, lastTwo, pesoPrice, periodLabel, rangeLabel, value } from './format.ts';

const rows: PlaceRow[] = [
  ['137404000', 'Quezon City', null, '130000000', 14.67656, 121.05968, 1],
  ['137403000', 'City of Pasig', null, '130000000', 14.60059, 121.07523, 1],
  ['072217000', 'City of Cebu', '072200000', '070000000', 10.29349, 123.90182, 3],
  ['072234000', 'Minglanilla', '072200000', '070000000', 10.25, 123.79, 0],
  ['141102000', 'City of Baguio', '141100000', '140000000', 16.412, 120.5934, 2],
  ['141110000', 'La Trinidad', '141100000', '140000000', 16.46, 120.59, 0],
  ['153600000', 'Somewhere', null, '150000000', 7.0, 124.0, 0],
];
const file: PlacesFile = {
  rows,
  names: { '072200000': 'Cebu', '141100000': 'Benguet', '130000000': 'NCR', '070000000': 'Region VII' },
  psa: ['072200000', '141100000', '070000000', '130000000'],
};

test('km: Manila to Cebu is ~570 km', () => {
  const d = km(14.5995, 120.9842, 10.3157, 123.8854);
  assert.ok(d > 550 && d < 590, `${d}`);
});

test('nearestPlace picks the closest centroid', () => {
  assert.equal(nearestPlace(rows, 14.65, 121.05)?.place.name, 'Quezon City');
  assert.equal(nearestPlace(rows, 10.26, 123.8)?.place.name, 'Minglanilla');
});

test('foodSource: NCR -> DA, PSA city, province, region fallbacks', () => {
  assert.deepEqual(foodSource(toPlace(rows[0]), file.psa), { kind: 'da' });
  assert.deepEqual(foodSource(toPlace(rows[2]), file.psa), { kind: 'psa', code: '072217000', level: 'city' });
  assert.deepEqual(foodSource(toPlace(rows[3]), file.psa), { kind: 'psa', code: '072200000', level: 'province' });
  assert.equal(foodSource(toPlace(rows[6]), file.psa), null);
});

test('fuelArea uses own town when covered, else nearest covered', () => {
  const minglanilla = toPlace(rows[3]);
  const r = fuelArea(rows, minglanilla, minglanilla.lat, minglanilla.lng);
  assert.equal(r?.place.name, 'City of Cebu');
  assert.ok((r?.km ?? 0) > 5);
  const qc = toPlace(rows[0]);
  assert.equal(fuelArea(rows, qc, qc.lat, qc.lng)?.km, 0);
});

test('nearestMarkets sorts by distance', () => {
  const ms = [
    { id: 'far', name: 'Far', lat: 14.4, lng: 121.0 },
    { id: 'near', name: 'Near', lat: 14.66, lng: 121.05 },
  ];
  assert.deepEqual(nearestMarkets(ms, 14.67, 121.06, 2).map((x) => x.market.id), ['near', 'far']);
});

test('nearestMarkets: guessed locations rank lower, inactive markets are skipped', () => {
  const ms = [
    { id: 'guess', name: 'Guess', lat: 14.67, lng: 121.06, approx: true, last: '2026-10-02' },
    { id: 'known', name: 'Known', lat: 14.68, lng: 121.07, last: '2026-10-02' },
    { id: 'gone', name: 'Gone', lat: 14.67, lng: 121.06, last: '2026-03-31' },
  ];
  assert.deepEqual(nearestMarkets(ms, 14.67, 121.06, 3, '2026-09-01').map((x) => x.market.id), ['known', 'guess']);
});

test('searchPlaces: prefix beats substring, "City of" ignored, province matches', () => {
  assert.equal(searchPlaces(file, 'cebu')[0].name, 'City of Cebu');
  assert.equal(searchPlaces(file, 'trini')[0].name, 'La Trinidad');
  assert.ok(searchPlaces(file, 'benguet').some((p) => p.name === 'La Trinidad'));
  assert.deepEqual(searchPlaces(file, 'q'), []);
});

test('series helpers', () => {
  assert.equal(value([40, 50]), 45);
  assert.deepEqual(lastTwo([10, null, [20, 30], null]), { last: 25, lastIdx: 2, prev: 10 });
  assert.equal(change(110, 100)?.toFixed(2), '0.10');
  assert.equal(change(null, 100), null);
  assert.equal(pesoPrice([45, 52.5]), '₱45.00–52.50');
  assert.equal(periodLabel('2026-10-05'), 'Oct 5');
  assert.equal(periodLabel('2026-09'), 'September 2026');
  assert.equal(rangeLabel('2026-09-29', '2026-10-05'), 'Sep 29 – Oct 5');
  assert.equal(rangeLabel('2026-09-01', '2026-09-07'), 'Sep 1–7');
});
