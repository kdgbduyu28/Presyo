import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
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
}));
