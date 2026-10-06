import { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { change, pesoPrice, Price, UNIT_LABEL } from '../lib/format';
import { useWatch } from '../lib/watch';
import { C, R } from '../theme';
import { Sparkline } from './Chart';

/** ▲ 3.2% (red: dearer) / ▼ 1.0% (green: cheaper). */
export function Delta({ last, prev, small }: { last: number | null; prev: number | null; small?: boolean }) {
  const c = change(last, prev);
  if (c == null || Math.abs(c) < 0.0005) {
    return <Text style={[s.delta, { color: C.faint }, small && s.small]}>{c == null ? '' : 'no change'}</Text>;
  }
  const up = c > 0;
  return (
    <Text style={[s.delta, { color: up ? C.up : C.down }, small && s.small]}>
      {up ? '▲' : '▼'} {Math.abs(c * 100).toFixed(1)}%
    </Text>
  );
}

export function PriceRow({ title, subtitle, badge, starred, price, unit, last, prev, spark, onPress }: {
  title: string;
  subtitle?: string;
  badge?: string;
  starred?: boolean;
  price: Price;
  unit: string;
  last: number | null;
  prev: number | null;
  spark?: (number | null)[];
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.bg }]}
      accessibilityRole="button" accessibilityLabel={`${title}, ${pesoPrice(price)} ${UNIT_LABEL[unit] ?? ''}`}>
      <View style={{ flex: 1 }}>
        <View style={s.titleLine}>
          <Text style={s.title} numberOfLines={2}>{starred ? <Text style={s.star}>★ </Text> : null}{title}</Text>
          {badge ? <Text style={s.badge}>{badge}</Text> : null}
        </View>
        {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {spark ? <Sparkline values={spark} /> : null}
      <View style={s.right}>
        <Text style={s.price}>
          {pesoPrice(price)}
          <Text style={s.unit}>{UNIT_LABEL[unit] ?? ''}</Text>
        </Text>
        <Delta last={last} prev={prev} small />
      </View>
    </Pressable>
  );
}

/** ☆/★ toggle for items with a catalog key (they show on the Today card). */
export function StarButton({ itemKey }: { itemKey?: string }) {
  const watch = useWatch();
  if (!itemKey) return null;
  const on = watch.has(itemKey);
  return (
    <Pressable onPress={() => watch.toggle(itemKey)} style={[s.starBtn, on && s.starBtnOn]} hitSlop={8}
      accessibilityRole="button" accessibilityState={{ selected: on }}
      accessibilityLabel={on ? 'Remove from my items' : 'Add to my items'}>
      <Text style={[s.starBtnText, on && { color: '#fff' }]}>{on ? '★ My item' : '☆ Add to my items'}</Text>
    </Pressable>
  );
}

const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'share' in navigator);

export function ShareButton({ text }: { text: string }) {
  if (!canShare) return null;
  return (
    <Pressable onPress={() => Share.share({ message: text }).catch(() => {})} style={s.share}
      accessibilityRole="button">
      <Text style={s.shareText}>Share this price</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

export function Chips<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={s.chips}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} style={[s.chip, on && s.chipOn]}
            accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && s.chipTextOn]} numberOfLines={1}>{o.label}</Text>
            {o.hint ? <Text style={[s.chipHint, on && s.chipTextOn]}>{o.hint}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Loading() {
  return <ActivityIndicator color={C.primary} style={{ paddingVertical: 32 }} />;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <View style={[s.notice, tone === 'warn' && { backgroundColor: C.warnBg }]}>
      <Text style={[s.noticeText, tone === 'warn' && { color: C.warn }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: 15, fontWeight: '600', color: C.text, flexShrink: 1 },
  badge: {
    fontSize: 11, color: C.muted, borderWidth: 1, borderColor: C.line,
    borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden',
  },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 2 },
  right: { alignItems: 'flex-end', minWidth: 96 },
  price: { fontSize: 16, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, fontWeight: '400', color: C.muted },
  delta: { fontSize: 13, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
  small: { fontSize: 12 },
  star: { color: '#D97706' },
  starBtn: { borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 },
  starBtnOn: { backgroundColor: '#D97706', borderColor: '#D97706' },
  starBtnText: { fontSize: 13, fontWeight: '600', color: C.text },
  share: { marginTop: 20, alignSelf: 'flex-start', paddingVertical: 8 },
  shareText: { color: C.primary, fontWeight: '600', fontSize: 14 },
  card: {
    backgroundColor: C.card, borderRadius: R.xl, marginHorizontal: 16, marginBottom: 12,
    overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line,
  },
  section: {
    fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: 16, marginTop: 8, marginBottom: 8,
  },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 12, alignItems: 'flex-start' },
  chip: {
    borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.card,
    paddingHorizontal: 14, paddingVertical: 8, maxWidth: 240,
  },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: C.text },
  chipHint: { fontSize: 11, color: C.muted, marginTop: 1 },
  chipTextOn: { color: '#fff' },
  notice: { backgroundColor: C.primarySoft, borderRadius: R.lg, padding: 12, marginHorizontal: 16, marginBottom: 12 },
  noticeText: { fontSize: 13, color: C.primaryDark, lineHeight: 18 },
});
