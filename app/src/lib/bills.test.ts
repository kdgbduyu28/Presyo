import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fare, fxPer, meralcoBill, waterProviders, type BillPoint, type WaterFile } from './bills.ts';

const jeep = { base: 14, base_km: 4, per_km: 2 };

test('fare: minimum covers the base km, each started km after adds the rate', () => {
  assert.equal(fare(jeep, 1), 14);
  assert.equal(fare(jeep, 4), 14);
  assert.equal(fare(jeep, 4.2), 16);
  assert.equal(fare(jeep, 5), 16);
  assert.equal(fare(jeep, 10), 26);
});

test('fare: rounds to 25 centavos; discount is 20% off the regular fare', () => {
  assert.equal(fare({ base: 13, base_km: 4, per_km: 1.8 }, 5), 14.75); // 14.80
  assert.equal(fare({ base: 15, base_km: 5, per_km: 2.49 }, 6), 17.5); // 17.49
  assert.equal(fare(jeep, 4, { discountPct: 20 }), 11.25); // 11.20
  assert.equal(fare(jeep, 5, { discountPct: 20 }), 12.75); // 12.80
});

// Meralco, September 2026 (non-lifeline)
const sep: BillPoint[] = [[50, 755.2], [70, 1047.62], [100, 1486.29], [200, 2948.48], [300, 4515.51],
  [400, 6144.47], [500, 7961.65], [600, 9549.19], [1000, 15934.27]];

test('meralcoBill: table levels are exact, the first band is linear', () => {
  assert.equal(meralcoBill(sep, 200), 2948.48);
  const b150 = meralcoBill(sep, 150)!;
  assert.ok(Math.abs(b150 - (1486.29 + 2948.48) / 2) < 0.01);
});

test('meralcoBill: above a band edge the higher distribution rate applies to all kWh', () => {
  const b250 = meralcoBill(sep, 250)!;
  // fixed ≈ ₱24.10; 300 kWh variable part scaled to 250 kWh
  assert.ok(Math.abs(b250 - (24.1 + (4515.51 - 24.1) * (250 / 300))) < 0.5);
  assert.ok(b250 > (2948.48 + 4515.51) / 2 - 400 && b250 < 4515.51);
  // within the top band: plain interpolation; beyond the table: extrapolation
  assert.ok(Math.abs(meralcoBill(sep, 550)! - (7961.65 + 9549.19) / 2) < 0.01);
  assert.ok(meralcoBill(sep, 1200)! > 15934.27);
  assert.equal(meralcoBill(sep, 0), null);
});

const water: WaterFile = {
  checked: '2026-10-12',
  concessionaires: [
    { id: 'maynilad', name: 'Maynilad', zone: 'West', url: '', adjustments: [],
      all_in: { effective: '', unsewered: 1, sewered: 1, source: '' }, areas: { all: ['caloocan'], part: ['manila'] } },
    { id: 'mwc', name: 'Manila Water', zone: 'East', url: '', adjustments: [],
      all_in: { effective: '', unsewered: 1, sewered: 1, source: '' }, areas: { all: ['pasig'], part: ['manila'] } },
  ],
};

test('waterProviders: whole-city, split city, outside Metro Manila', () => {
  assert.deepEqual(waterProviders(water, 'caloocan').map((c) => c.id), ['maynilad']);
  assert.deepEqual(waterProviders(water, 'manila').map((c) => c.id), ['maynilad', 'mwc']);
  assert.deepEqual(waterProviders(water, 'cebu'), []);
});

test('fxPer', () => {
  assert.equal(fxPer(62.8), 1);
  assert.equal(fxPer(0.3967), 100);
  assert.equal(fxPer(0.0035), 1000);
});
