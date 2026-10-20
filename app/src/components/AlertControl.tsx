import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { peso } from '../lib/format';
import { usePrefs } from '../lib/prefs';
import { useWatch } from '../lib/watch';
import { C, R, themed } from '../theme';

/** "Tell me when it's ₱X or less": a target kept on this device. Today shows
 *  a banner once the price meets it (checked whenever the app opens; there's
 *  no server, so no push notification). Setting one also stars the item. */
export function AlertControl({ id, current, unit }: { id: string; current: number | null; unit?: string }) {
  const { prefs, set } = usePrefs();
  const watch = useWatch();
  const target = prefs.alerts[id];
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const per = unit ? ` ${unit}` : '';

  const save = () => {
    const v = parseFloat(draft.replace(/[₱,\s]/g, ''));
    if (!(v > 0)) return;
    set((p) => ({ alerts: { ...p.alerts, [id]: v } }));
    if (!watch.has(id)) watch.toggle(id);
    setEditing(false);
  };
  const remove = () => {
    set((p) => {
      const next = { ...p.alerts };
      delete next[id];
      return { alerts: next };
    });
    setEditing(false);
  };

  if (target != null && !editing) {
    const met = current != null && current <= target;
    return (
      <View style={[s.box, met && { borderColor: C.down, backgroundColor: C.downBg }]}>
        <Text style={s.text}>
          🔔 {met ? 'Target reached: ' : 'Alert at '}<Text style={s.bold}>{peso(target)}{per}</Text>
          {met ? ' — it’s at or below your price now.' : ' or less. Shows on Today when it drops there.'}
        </Text>
        <View style={s.actions}>
          <Pressable onPress={() => { setDraft(String(target)); setEditing(true); }} hitSlop={6} accessibilityRole="button">
            <Text style={s.link}>Change</Text>
          </Pressable>
          <Pressable onPress={remove} hitSlop={6} accessibilityRole="button">
            <Text style={s.link}>Remove</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!editing) {
    return (
      <Pressable onPress={() => { setDraft(current ? String(Math.floor(current * 0.95)) : ''); setEditing(true); }}
        style={s.add} accessibilityRole="button">
        <Text style={s.addText}>🔔 Alert me when it drops</Text>
      </Pressable>
    );
  }
  return (
    <View style={s.box}>
      <Text style={s.text}>Tell me when it’s at or below:</Text>
      <View style={s.row}>
        <Text style={s.peso}>₱</Text>
        <TextInput value={draft} onChangeText={setDraft} keyboardType="decimal-pad" style={s.input} autoFocus
          onSubmitEditing={save} accessibilityLabel="Target price in pesos" selectTextOnFocus />
        <Pressable onPress={save} style={s.save} accessibilityRole="button">
          <Text style={s.saveText}>Set alert</Text>
        </Pressable>
        <Pressable onPress={() => setEditing(false)} hitSlop={6} accessibilityRole="button">
          <Text style={s.link}>Cancel</Text>
        </Pressable>
      </View>
      {current != null ? <Text style={s.hint}>Now {peso(current)}{per}</Text> : null}
    </View>
  );
}

const s = themed(() => ({
  add: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 },
  addText: { fontSize: 13, fontWeight: '600', color: C.text },
  box: { borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 12, gap: 8 },
  text: { fontSize: 13, color: C.text, lineHeight: 18 },
  bold: { fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 16 },
  link: { fontSize: 13, fontWeight: '600', color: C.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  peso: { fontSize: 16, fontWeight: '700', color: C.text },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 16, color: C.text, backgroundColor: C.card, width: 120,
  },
  save: { backgroundColor: C.primary, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7 },
  saveText: { color: C.onPrimary, fontWeight: '700', fontSize: 13 },
  hint: { fontSize: 12, color: C.muted },
}));
