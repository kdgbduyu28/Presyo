// Small slippy map without a map library: OpenStreetMap tiles placed by hand and
// pins positioned in pixels (Web Mercator). Pure (no RN imports) so it runs under node --test.

export const TILE = 256;

/** World pixel position of a point at zoom `z`. */
export function project(lat: number, lng: number, z: number): { x: number; y: number } {
  const size = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size };
}

export type Pt = { lat: number; lng: number };

/** Highest zoom (up to `max`) at which every point fits in w×h with `pad` px to spare,
 *  and the view's top-left world pixel when centred on the points. */
export function fitView(points: Pt[], w: number, h: number, { pad = 28, max = 15, min = 8 } = {}) {
  for (let z = max; z >= min; z--) {
    const px = points.map((p) => project(p.lat, p.lng, z));
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (x1 - x0 <= w - pad * 2 && y1 - y0 <= h - pad * 2 || z === min) {
      return { z, left: (x0 + x1) / 2 - w / 2, top: (y0 + y1) / 2 - h / 2 };
    }
  }
  throw new Error('unreachable');
}

/** Tiles covering the view, each with its offset inside the view. */
export function tilesFor(view: { z: number; left: number; top: number }, w: number, h: number) {
  const n = 2 ** view.z;
  const out: { key: string; url: string; x: number; y: number }[] = [];
  for (let ty = Math.floor(view.top / TILE); ty * TILE < view.top + h; ty++) {
    for (let tx = Math.floor(view.left / TILE); tx * TILE < view.left + w; tx++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      out.push({
        key: `${view.z}/${tx}/${ty}`,
        url: `https://tile.openstreetmap.org/${view.z}/${wx}/${ty}.png`,
        x: tx * TILE - view.left,
        y: ty * TILE - view.top,
      });
    }
  }
  return out;
}
