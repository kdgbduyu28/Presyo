import { useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { peso, periodLabel } from '../lib/format';
import { C, themed } from '../theme';

function path(values: (number | null)[], w: number, h: number, pad: number, lo: number, hi: number) {
  const n = values.length;
  const span = hi - lo || 1;
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      pen = false; // gap: don't draw across missing periods
      return;
    }
    const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
    const y = pad + (1 - (v - lo) / span) * (h - pad * 2);
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

function bounds(values: (number | null)[]) {
  const vs = values.filter((v): v is number => v != null);
  return vs.length ? { lo: Math.min(...vs), hi: Math.max(...vs) } : null;
}

export function Sparkline({ values, width = 64, height = 24, color = C.muted }: {
  values: (number | null)[]; width?: number; height?: number; color?: string;
}) {
  const b = bounds(values);
  if (!b || values.filter((v) => v != null).length < 2) return <View style={{ width, height }} />;
  return (
    <Svg width={width} height={height}>
      <Path d={path(values, width, height, 3, b.lo, b.hi)} stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

/** Full-width line chart with low/high guides and the first/last period labels. */
export function Chart({ periods, values, height = 160 }: { periods: string[]; values: (number | null)[]; height?: number }) {
  const [w, setW] = useState(0);
  const b = bounds(values);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  if (!b) return <Text style={s.empty}>No history yet.</Text>;

  const pad = 10;
  const last = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
  const lastV = values[last] as number;
  const n = values.length;
  const x = n === 1 ? w / 2 : (last / (n - 1)) * w;
  const y = pad + (1 - (lastV - b.lo) / (b.hi - b.lo || 1)) * (height - pad * 2);

  return (
    <View>
      <Text style={s.guide}>High {peso(b.hi)}</Text>
      <View onLayout={onLayout} style={{ height }}>
        {w > 0 && (
          <Svg width={w} height={height}>
            <Line x1={0} x2={w} y1={pad} y2={pad} stroke={C.line} strokeDasharray="3,4" />
            <Line x1={0} x2={w} y1={height - pad} y2={height - pad} stroke={C.line} strokeDasharray="3,4" />
            <Path d={path(values, w, height, pad, b.lo, b.hi)} stroke={C.primary} strokeWidth={2} fill="none" />
            <Circle cx={x} cy={y} r={4} fill={C.primary} />
          </Svg>
        )}
      </View>
      <Text style={s.guide}>Low {peso(b.lo)}</Text>
      <View style={s.axis}>
        <Text style={s.axisLabel}>{periodLabel(periods[0])}</Text>
        <Text style={s.axisLabel}>{periodLabel(periods[periods.length - 1])}</Text>
      </View>
    </View>
  );
}

const s = themed(() => ({
  empty: { color: C.muted, paddingVertical: 24, textAlign: 'center' },
  guide: { color: C.muted, fontSize: 12, textAlign: 'right' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisLabel: { color: C.faint, fontSize: 12 },
  tick: { position: 'absolute', left: 0, width: 40, fontSize: 11, color: C.muted, fontVariant: ['tabular-nums'] },
  tip: {
    position: 'absolute', top: 0, backgroundColor: C.card, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 6,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  tipDate: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 2 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 1 },
  tipLabel: { flex: 1, fontSize: 12, color: C.muted },
  tipValue: { fontSize: 12, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12, color: C.muted },
}));

// ---------------------------------------------------------------- step lines

/** One line per source: the price it changed to on each date (null = not listed). */
export type StepSeries = { id: string; label: string; color: string; h: [string, number | null][] };

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const isoOf = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);

/** Price at `d`: the last change on or before it. */
export function valueAt(h: [string, number | null][], d: string): number | null {
  let v: number | null = null;
  for (const [date, p] of h) {
    if (date > d) break;
    v = p;
  }
  return v;
}

/** "₱79,990" -> "₱80k" for axis ticks. */
function compactPeso(n: number) {
  return n >= 1000 ? `₱${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}k` : `₱${Math.round(n)}`;
}

/** Prices that hold until they change (store listings): step lines on a
 *  time axis, hairline gridlines, end markers, and a scrub/hover readout. */
export function StepChart({ start, end, series, height = 180 }: {
  start: string; end: string; series: StepSeries[]; height?: number;
}) {
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null); // x in px
  const box = useRef<View>(null);
  const originX = useRef(0);
  const vs = series.flatMap((s) => s.h.map(([, p]) => p)).filter((p): p is number => p != null);
  if (!vs.length) return <Text style={s.empty}>No history yet.</Text>;

  const AXIS = 44;
  const TIP_W = Math.min(190, w);
  const pad = 10;
  const plotW = Math.max(w - AXIS, 1);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  const margin = Math.max((hi - lo) * 0.08, hi * 0.02);
  lo -= margin;
  hi += margin;
  const d0 = day(start);
  const d1 = Math.max(day(end), d0 + 1);
  const X = (iso: string) => AXIS + ((day(iso) - d0) / (d1 - d0)) * plotW;
  const Y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);
  // one flat line (a single store, no change yet) gets one tick, not three equal ones
  const ticks = [...new Set([hi - margin, (hi + lo) / 2, lo + margin].map((t) => Math.round(t)))];
  const xEnd = AXIS + plotW;

  const pathOf = (h: [string, number | null][]) => {
    let d = '';
    h.forEach(([date, p], i) => {
      if (p == null) return;
      const x0 = X(date);
      const x1 = i + 1 < h.length ? X(h[i + 1][0]) : xEnd;
      const y = Y(p).toFixed(1);
      // a vertical riser joins the previous step when it was a price, not a gap
      d += `${i > 0 && h[i - 1][1] != null ? 'L' : 'M'}${x0.toFixed(1)},${y}H${x1.toFixed(1)}`;
    });
    return d;
  };

  const measure = () => box.current?.measureInWindow((x) => { originX.current = x; });
  const track = (clientX: number) => {
    const x = clientX - originX.current;
    setHover(x < AXIS ? AXIS : x > xEnd ? xEnd : x);
  };
  const hoverDay = hover == null ? null : [isoOf(Math.round(d0 + ((hover - AXIS) / plotW) * (d1 - d0))), end].sort()[0];
  const readout = hoverDay
    ? series.map((sr) => ({ sr, v: valueAt(sr.h, hoverDay) })).filter((r) => r.v != null)
      .sort((a, b) => (a.v as number) - (b.v as number))
    : [];

  return (
    <View>
      <View
        ref={box}
        onLayout={(e) => { setW(e.nativeEvent.layout.width); measure(); }}
        style={{ height }}
        // touch: press and drag to read prices; mouse: hover
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => true}
        onResponderGrant={(e) => { measure(); track(e.nativeEvent.pageX); }}
        onResponderMove={(e) => track(e.nativeEvent.pageX)}
        onResponderRelease={() => setHover(null)}
        onResponderTerminate={() => setHover(null)}
        {...(Platform.OS === 'web' ? {
          onPointerEnter: measure,
          onPointerMove: (e: { nativeEvent: { clientX: number; pointerType?: string } }) => {
            if (e.nativeEvent.pointerType !== 'touch') track(e.nativeEvent.clientX);
          },
          onPointerLeave: () => setHover(null),
        } : {})}
        accessibilityLabel={`Price history from ${periodLabel(start)} to ${periodLabel(end)}`}
      >
        {w > 0 && (
          <Svg width={w} height={height}>
            {ticks.map((t) => (
              <Line key={t} x1={AXIS} x2={xEnd} y1={Y(t)} y2={Y(t)} stroke={C.line} strokeWidth={1} />
            ))}
            {series.map((sr) => <Path key={sr.id} d={pathOf(sr.h)} stroke={sr.color} strokeWidth={2} fill="none" />)}
            {series.map((sr) => {
              const last = sr.h[sr.h.length - 1];
              return last?.[1] != null ? (
                <Circle key={sr.id} cx={xEnd - 5} cy={Y(last[1])} r={4} fill={sr.color} stroke={C.card} strokeWidth={2} />
              ) : null;
            })}
            {hover != null && <Line x1={hover} x2={hover} y1={0} y2={height} stroke={C.muted} strokeWidth={1} />}
          </Svg>
        )}
        {w > 0 && ticks.map((t) => (
          <Text key={t} style={[s.tick, { top: Y(t) - 8 }]} pointerEvents="none">{compactPeso(t)}</Text>
        ))}
        {hoverDay && readout.length ? (
          <View pointerEvents="none"
            style={[s.tip, { width: TIP_W, left: Math.max(0, hover! + 8 + TIP_W <= w ? hover! + 8 : hover! - 8 - TIP_W) }]}>
            <Text style={s.tipDate}>{periodLabel(hoverDay)}</Text>
            {readout.map(({ sr, v }) => (
              <View key={sr.id} style={s.tipRow}>
                <View style={[s.swatch, { backgroundColor: sr.color }]} />
                <Text style={s.tipLabel} numberOfLines={1}>{sr.label}</Text>
                <Text style={s.tipValue}>{peso(v as number).replace(/\.00$/, '')}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={[s.axis, { marginLeft: AXIS }]}>
        <Text style={s.axisLabel}>{periodLabel(start)}</Text>
        <Text style={s.axisLabel}>{end === start ? 'Today' : periodLabel(end)}</Text>
      </View>
      {/* legend: identity never rests on color alone */}
      <View style={s.legend}>
        {series.map((sr) => (
          <View key={sr.id} style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: sr.color }]} />
            <Text style={s.legendText}>{sr.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
