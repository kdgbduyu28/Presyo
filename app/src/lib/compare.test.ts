import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cheaper, compareItems } from './compare.ts';

const row = (key: string, last: number, extra = {}) => ({ key, item: key, unit: 'kg', cat: 'rice', last, period: '2026-09', ...extra });

test('compareItems joins by key and keeps a, then b-only order', () => {
  const a = [row('rice', 50), row('egg', 8)];
  const b = [row('egg', 9), row('fish', 200)];
  assert.deepEqual(compareItems(a, b).map((r) => [r.key, r.a, r.b]), [['rice', 50, null], ['egg', 8, 9], ['fish', null, 200]]);
});

test('compareItems picks the preferred variant on each side', () => {
  const a = [row('rice', 50, { origin: 'local', variants: [row('rice', 44, { origin: 'imported' })] })];
  const b = [row('rice', 52, { origin: 'local' })];
  assert.deepEqual(compareItems(a, b, 'imported').map((r) => [r.a, r.b]), [[44, 52]]);
  assert.deepEqual(compareItems(a, b, 'local').map((r) => [r.a, r.b]), [[50, 52]]);
});

test('cheaper ignores tiny differences and missing prices', () => {
  assert.equal(cheaper(50, 52), 'a');
  assert.equal(cheaper(52, 50), 'b');
  assert.equal(cheaper(100, 100.3), null);
  assert.equal(cheaper(null, 50), null);
});
