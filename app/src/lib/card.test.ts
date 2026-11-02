import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { linePoints, priceCardSvg, wrap } from './card.ts';

const colors = { bg: '#F5F5F0', card: '#FFF', text: '#111', muted: '#666', primary: '#15803D', up: '#DC2626', down: '#15803D', line: '#EEE' };

describe('price card', () => {
  it('wraps long titles to two lines', () => {
    assert.deepEqual(wrap('Red Onion', 26), ['Red Onion']);
    assert.deepEqual(wrap('Chicken Egg (White, Medium) from a very long named market stall', 26).length, 2);
    assert.ok(wrap('a b c d e f g h i j k l m n o p q r s t u v w x y z aa bb cc dd ee', 10).at(-1)!.endsWith('…'));
  });

  it('draws the history line inside its box', () => {
    const pts = linePoints([10, null, 20, 15], 300, 100).split(' ').map((p) => p.split(',').map(Number));
    assert.deepEqual(pts, [[0, 100], [200, 0], [300, 50]]);
    assert.equal(linePoints([5], 300, 100), '');
  });

  it('escapes text and colours the change', () => {
    const svg = priceCardSvg({
      title: 'Salt & <Iodized>', price: '₱43.04', unit: '/kg', change: 0.019, changeLabel: 'vs previous report',
      where: 'Metro Manila average · DA', date: 'Oct 20', values: [40, 41, 43], colors,
    });
    assert.ok(svg.includes('Salt &amp; &lt;Iodized&gt;'));
    assert.ok(svg.includes('▲ 1.9% vs previous report'));
    assert.ok(svg.includes(`fill="${colors.up}"`));
    assert.ok(svg.includes('<polyline'));
    const flat = priceCardSvg({ title: 'Tomato', price: '₱100.00', unit: '/kg', change: 0, changeLabel: 'vs previous report',
      where: '', date: '', values: [], colors });
    assert.ok(flat.includes('no change vs previous report'));
    assert.ok(!flat.includes('<polyline'));
  });
});
