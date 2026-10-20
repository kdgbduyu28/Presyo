import assert from 'node:assert/strict';
import { test } from 'node:test';

import { abroadRows, bestOffer, gadgetId, installment, metAlerts, money, parseGadgetId } from './gadgets.ts';

test('gadget ids round-trip', () => {
  const id = gadgetId('iphone-17', '256GB Wi-Fi + Cellular');
  assert.equal(id, 'g:iphone-17|256GB Wi-Fi + Cellular');
  assert.deepEqual(parseGadgetId(id), { key: 'iphone-17', spec: '256GB Wi-Fi + Cellular' });
  assert.equal(parseGadgetId('rice_regular'), null);
});

test('best offer skips out-of-stock and unlisted', () => {
  const v = {
    spec: '256GB',
    offers: [
      { store: 'a', price: 60000, stock: false, h: [] },
      { store: 'b', price: 65000, stock: true, h: [] },
      { store: 'c', h: [] },
      { store: 'apple', price: 69990, h: [] },
    ],
  };
  assert.equal(bestOffer(v)?.store, 'b');
});

test('installments round up', () => {
  assert.equal(installment(69990, 12), 5833);
  assert.equal(installment(12000, 12, 0.01), 1120);
});

test('abroad rows are cheapest first, compared with the PH price', () => {
  const countries = [
    { cc: 'US', name: 'United States', cur: 'USD', note: '', rate: 63, rate_date: '2026-10-15', checked: '' },
    { cc: 'JP', name: 'Japan', cur: 'JPY', note: '', rate: 0.4, rate_date: '2026-10-15', checked: '' },
  ];
  const v = { spec: '256GB', offers: [], abroad: [
    { cc: 'JP', price: 159800, php: 63920, url: '' }, { cc: 'US', price: 899, php: 56637, url: '' },
  ] };
  const rows = abroadRows(v, countries, 69990);
  assert.deepEqual(rows.map((r) => r.country.cc), ['US', 'JP']);
  assert.ok(Math.abs((rows[0].vsPh as number) - 0.1908) < 0.001);
  assert.equal(money(159800, 'JPY'), '¥159,800');
  assert.equal(money(899, 'USD'), '$899');
});

test('alerts fire at or below the target', () => {
  assert.deepEqual(metAlerts({ a: 100, b: 50, c: 10 }, { a: 100, b: 60, c: null }), { a: 100 });
});
