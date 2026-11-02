import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitView, project, tilesFor, TILE } from './map.ts';

test('project: equator / prime meridian is the middle of the world', () => {
  const p = project(0, 0, 1);
  assert.equal(p.x, TILE);
  assert.ok(Math.abs(p.y - TILE) < 1e-9);
  const qc = project(14.65, 121.05, 12);
  assert.equal(Math.floor(qc.x / TILE), 3425); // OSM tile x for Quezon City at z12
  assert.equal(Math.floor(qc.y / TILE), 1879);
});

test('fitView: zooms out until all points fit, centred on them', () => {
  const pts = [{ lat: 14.65, lng: 121.05 }, { lat: 14.55, lng: 121.0 }];
  const v = fitView(pts, 400, 280);
  const px = pts.map((p) => project(p.lat, p.lng, v.z));
  for (const p of px) {
    assert.ok(p.x - v.left >= 28 && p.x - v.left <= 400 - 28);
    assert.ok(p.y - v.top >= 28 && p.y - v.top <= 280 - 28);
  }
  // one zoom closer would not fit
  const closer = pts.map((p) => project(p.lat, p.lng, v.z + 1));
  assert.ok(Math.abs(closer[0].y - closer[1].y) > 280 - 56 || Math.abs(closer[0].x - closer[1].x) > 400 - 56);
  assert.equal(fitView([pts[0]], 400, 280).z, 15);
});

test('tilesFor: covers the view', () => {
  const v = { z: 12, left: 3425 * TILE + 100, top: 1879 * TILE + 200 };
  const tiles = tilesFor(v, 400, 280);
  assert.equal(tiles.length, 4); // x 100..500 and y 200..480: 2 × 2 tiles
  assert.deepEqual(tiles[0], { key: '12/3425/1879', url: 'https://tile.openstreetmap.org/12/3425/1879.png', x: -100, y: -200 });
});
