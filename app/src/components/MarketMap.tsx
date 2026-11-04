import { useState } from 'react';
import { Image, LayoutChangeEvent, Linking, StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { fitView, project, tilesFor } from '../lib/map';
import { C, getScheme, R, themed } from '../theme';

export type Pin = { id: string; lat: number; lng: number; label: string; best?: boolean };

/** Markets on an OpenStreetMap background with a label (price) on each pin, plus "you". */
export function MarketMap({ pins, you, height = 300, style }: {
  pins: Pin[]; you: { lat: number; lng: number }; height?: number; style?: object;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const view = w > 0 ? fitView([you, ...pins], w, height, { pad: 36 }) : null;
  const at = (p: { lat: number; lng: number }) => {
    const q = project(p.lat, p.lng, view!.z);
    return { left: q.x - view!.left, top: q.y - view!.top };
  };
  // cheapest drawn last so it sits on top of crowded pins
  const order = [...pins].sort((a, b) => Number(!!a.best) - Number(!!b.best));
  return (
    <View style={[s.box, { height }, style]} onLayout={onLayout}>
      {view ? (
        <>
          {tilesFor(view, w, height).map((tile) => (
            <Image key={tile.key} source={{ uri: tile.url }} style={[s.tile, { left: tile.x, top: tile.y },
              getScheme() === 'dark' && { opacity: 0.75 }]} />
          ))}
          <View style={[s.you, at(you)]} accessibilityLabel={t('You are here')} />
          {order.map((p) => (
            <View key={p.id} style={[s.pinWrap, at(p)]} pointerEvents="none">
              <View style={[s.label, p.best && s.labelBest]}>
                <Text style={[s.labelText, p.best && { color: '#fff' }]} numberOfLines={1}>{p.label}</Text>
              </View>
              <View style={[s.dot, p.best && { backgroundColor: C.down }]} />
            </View>
          ))}
          <Text style={s.credit} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}>
            © OpenStreetMap
          </Text>
        </>
      ) : null}
    </View>
  );
}

const s = themed(() => ({
  box: {
    marginHorizontal: 16, marginBottom: 12, borderRadius: R.xl, overflow: 'hidden', backgroundColor: C.line,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.line,
  },
  tile: { position: 'absolute', width: 256, height: 256 },
  you: {
    position: 'absolute', width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 7,
    backgroundColor: '#2a78d6', borderWidth: 2, borderColor: '#fff',
  },
  // the dot sits on the point; the label floats above it
  pinWrap: { position: 'absolute', width: 80, marginLeft: -40, marginTop: -30, alignItems: 'center' },
  label: {
    backgroundColor: '#fff', borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#cfcfc8',
  },
  labelBest: { backgroundColor: C.down, borderColor: C.down },
  labelText: { fontSize: 11, fontWeight: '700', color: '#1C1F1A', fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 2, backgroundColor: '#1C1F1A', borderWidth: 1, borderColor: '#fff' },
  credit: {
    position: 'absolute', right: 0, bottom: 0, fontSize: 10, color: '#333', backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 4, paddingVertical: 1,
  },
}));
