// Price card image for sharing (Facebook groups, group chats). Builds a square
// SVG; the share button turns it into a PNG. Pure (no RN imports) so it runs
// under node --test.

export type CardData = {
  title: string;
  /** "₱124.79" or a range */
  price: string;
  /** "/kg" */
  unit: string;
  /** fraction vs the previous report, e.g. 0.032 */
  change: number | null;
  /** "vs previous report" */
  changeLabel: string;
  /** "no change" (shown before changeLabel when the price held) */
  noChange?: string;
  /** "Metro Manila average · DA Bantay Presyo" */
  where: string;
  /** "Oct 20" */
  date: string;
  values: (number | null)[];
  /** "Lowest at Pasig Mega Market ₱110.00" lines, at most 3 */
  extra?: string[];
  colors: { bg: string; card: string; text: string; muted: string; primary: string; up: string; down: string; line: string };
};

export const CARD_SIZE = 1080;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Split a title into lines of about `max` characters (2 lines at most, then "…"). */
export function wrap(text: string, max: number, lines = 2): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = `${out[lines - 1].slice(0, max - 1)}…`;
  }
  return out;
}

/** Polyline points for the history line inside a w×h box. */
export function linePoints(values: (number | null)[], w: number, h: number): string {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return '';
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const n = values.length;
  return values
    .map((v, i) => (v == null ? null : `${((i / (n - 1)) * w).toFixed(1)},${(h - ((v - lo) / (hi - lo || 1)) * h).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
}

export function priceCardSvg(d: CardData): string {
  const S = CARD_SIZE;
  const c = d.colors;
  const font = "font-family=\"-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif\"";
  const title = wrap(d.title, 26);
  const titleY = 250;
  const priceY = titleY + title.length * 76 + 110;
  const up = d.change != null && d.change > 0.0005;
  const down = d.change != null && d.change < -0.0005;
  const changeText = d.change == null ? '' : up || down
    ? `${up ? '▲' : '▼'} ${Math.abs(d.change * 100).toFixed(1)}% ${d.changeLabel}`
    : `${d.noChange ?? 'no change'} ${d.changeLabel}`;
  const pts = linePoints(d.values.slice(-60), S - 200, 170);
  const chartY = priceY + 90;
  const extraY = chartY + (pts ? 230 : 20);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" ${font}>
<rect width="${S}" height="${S}" fill="${c.bg}"/>
<rect x="40" y="40" width="${S - 80}" height="${S - 80}" rx="48" fill="${c.card}" stroke="${c.line}" stroke-width="2"/>
<text x="100" y="140" font-size="44" font-weight="800" fill="${c.primary}">Presyo</text>
<text x="${S - 100}" y="140" font-size="32" fill="${c.muted}" text-anchor="end">${esc(d.date)}</text>
${title.map((l, i) => `<text x="100" y="${titleY + i * 76}" font-size="64" font-weight="700" fill="${c.text}">${esc(l)}</text>`).join('\n')}
<text x="100" y="${priceY}" font-size="132" font-weight="800" fill="${c.text}">${esc(d.price)}<tspan font-size="52" font-weight="400" fill="${c.muted}">${esc(d.unit)}</tspan></text>
${changeText ? `<text x="100" y="${priceY + 62}" font-size="38" font-weight="600" fill="${up ? c.up : down ? c.down : c.muted}">${esc(changeText)}</text>` : ''}
${pts ? `<polyline transform="translate(100 ${chartY})" points="${pts}" fill="none" stroke="${c.primary}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
${(d.extra ?? []).slice(0, 3).map((l, i) => `<text x="100" y="${extraY + i * 50}" font-size="34" fill="${c.text}">${esc(l)}</text>`).join('\n')}
<text x="100" y="${S - 140}" font-size="32" fill="${c.muted}">${esc(d.where)}</text>
<text x="100" y="${S - 90}" font-size="32" font-weight="600" fill="${c.primary}">presyo.pages.dev</text>
</svg>`;
}
