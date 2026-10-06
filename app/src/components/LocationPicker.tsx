import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { locate, Spot } from '../lib/location';
import { placeName } from '../lib/names';
import { PlacesFile, searchPlaces } from '../lib/places';
import { C, R } from '../theme';

/** GPS button + city search. Used on first run and from the location chip. */
export function LocationPicker({ places, onPick }: { places: PlacesFile; onPick: (s: Spot) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const results = searchPlaces(places, q, 12);

  const useGps = async () => {
    setBusy(true);
    setErr(null);
    try {
      onPick(await locate());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Pressable onPress={useGps} style={({ pressed }) => [s.gps, pressed && { opacity: 0.85 }]}
        accessibilityRole="button" disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.gpsText}>📍  Use my location</Text>}
      </Pressable>
      {err ? <Text style={s.err}>{err} You can search for your city instead.</Text> : null}
      <Text style={s.or}>or choose your city / town</Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="e.g. Quezon City, Cebu, Tagum"
        placeholderTextColor={C.faint}
        style={s.input}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Search city or town"
      />
      {results.map((p) => (
        <Pressable key={p.code} onPress={() => onPick({ lat: p.lat, lng: p.lng, via: 'pick' })}
          style={({ pressed }) => [s.result, pressed && { backgroundColor: C.bg }]} accessibilityRole="button">
          <Text style={s.resultText}>{placeName(p, places)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  gps: { backgroundColor: C.primary, borderRadius: R.lg, paddingVertical: 14, alignItems: 'center' },
  gpsText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  err: { color: C.up, fontSize: 13, marginTop: 8 },
  or: { color: C.muted, fontSize: 13, textAlign: 'center', marginVertical: 14 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: R.lg, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: C.text, backgroundColor: C.card,
  },
  result: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  resultText: { fontSize: 15, color: C.text },
});
