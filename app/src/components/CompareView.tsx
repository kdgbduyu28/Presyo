import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { itemName } from '../i18n/items';
import { basketFromAverages, BasketLine, OriginPref, pickVariant } from '../lib/basket';
import { cheaper, compareItems } from '../lib/compare';
import { waterProviders, WaterFile } from '../lib/bills';
import { SummaryFile, useJson } from '../lib/data';
import { lastTwo, peso, periodLabel, UNIT_LABEL, value } from '../lib/format';
import type { Spot } from '../lib/location';
import { placeName } from '../lib/names';
import { foodSource, NCR, nearestPlace, Place, PlacesFile } from '../lib/places';
import { usePrefs, withRecent } from '../lib/prefs';
import { BASKET_KEY, useStored } from '../lib/stored';
import { C, tabLabel, themed } from '../theme';
import { STARTER } from './BasketView';
import { Card, Loading, Notice, SectionTitle } from './bits';
import { useLpg } from './FuelExtras';
import { LocationPicker } from './LocationPicker';
import { MERALCO_REGIONS, PowerFile } from './PowerView';
import { Sheet } from './Sheet';
import { useFuelHeadline } from './TodayView';

type Side = { place: Place; spot: Spot };
const GROUPS = ['rice', 'meat', 'seafood', 'vegetables', 'fruits', 'pantry'];

/** Here vs. a second place you pick (e.g. home vs. work city). */
export function CompareView({ place, spot, places }: { place: Place; spot: Spot; places: PlacesFile }) {
  const { prefs, set } = usePrefs();
  const [picking, setPicking] = useState(false);
  const other = useMemo(() => {
    const c = prefs.compare;
    const p = c ? nearestPlace(places.rows, c.lat, c.lng)?.place : null;
    return c && p ? { place: p, spot: { lat: c.lat, lng: c.lng, via: 'pick' as const } } : null;
  }, [prefs.compare, places]);

  const pick = (sp: Spot, label?: { code: string; name: string }) => {
    const p = nearestPlace(places.rows, sp.lat, sp.lng)?.place;
    if (!p) return;
    const chosen = { code: label?.code ?? p.code, name: label?.name ?? p.name, lat: sp.lat, lng: sp.lng };
    set((pr) => ({ compare: chosen, recent: label ? withRecent(pr.recent, chosen) : pr.recent }));
    setPicking(false);
  };
  const picker = <LocationPicker places={places} onPick={pick} recent={prefs.recent.filter((r) => r.code !== place.code)} />;

  if (!other) {
    return (
      <View>
        <Notice>{t('Compare prices here with a second place, like where you work or your province.')}</Notice>
        <Card style={{ padding: 16 }}>{picker}</Card>
      </View>
    );
  }
  return (
    <>
      <Comparison a={{ place, spot }} b={other} places={places} onChange={() => setPicking(true)} />
      <Sheet open={picking} onClose={() => setPicking(false)} title={t('Compare with')}>{picker}</Sheet>
    </>
  );
}

/** Your utility's residential rate there: the one picked in the Electricity tab, else Meralco where it serves. */
function usePower(place: Place, chosen: Record<string, string>) {
  const region = place.region;
  const own = useJson<PowerFile>(`power/${region}.json`);
  const ncr = useJson<PowerFile>(MERALCO_REGIONS.has(region) && region !== NCR ? `power/${NCR}.json` : null);
  const id = chosen[region] ?? (MERALCO_REGIONS.has(region) ? 'MERALCO' : null);
  const u = [...(ncr.data?.utilities ?? []), ...(own.data?.utilities ?? [])].find((x) => x.id === id);
  const rate = u ? lastTwo(u.s).last : null;
  return u && rate != null ? { id: u.id, rate } : null;
}

function useSide(side: Side, places: PlacesFile, fuel: string) {
  const { prefs } = usePrefs();
  const source = foodSource(side.place, places.psa);
  const scope = source?.kind === 'da' ? 'ncr' : source?.code ?? null;
  const summary = useJson<SummaryFile>(scope ? `summary/${scope}.json` : null);
  return {
    scope,
    source,
    summary,
    fuel: useFuelHeadline(side.place, side.spot, places, fuel),
    lpg: useLpg(side.place, side.spot, places),
    power: usePower(side.place, prefs.utility),
    name: placeName(side.place, places, { short: true }),
  };
}

function Comparison({ a, b, places, onChange }: { a: Side; b: Side; places: PlacesFile; onChange: () => void }) {
  const { prefs } = usePrefs();
  const [lines] = useStored<BasketLine[]>(BASKET_KEY, STARTER);
  const A = useSide(a, places, prefs.fuel);
  const B = useSide(b, places, prefs.fuel);
  const water = useJson<WaterFile>('water.json');
  // Metro Manila concessionaires only; your pick from the Water tab where both serve
  const waterAt = (p: Place) => {
    const list = water.data ? waterProviders(water.data, p.code) : [];
    const c = list.find((x) => x.id === prefs.waterCo) ?? list[0];
    return c ? { name: c.name, rate: prefs.sewered ? c.all_in.sewered : c.all_in.unsewered } : null;
  };
  const wA = waterAt(a.place);
  const wB = waterAt(b.place);

  const food = useMemo(
    () => compareItems(A.summary.data?.items ?? [], B.summary.data?.items ?? [], prefs.origin),
    [A.summary.data, B.summary.data, prefs.origin],
  );
  // Basket list in both places, like with like: only the items both places price
  const pa = A.summary.data ? priceMap(A.summary.data, prefs.origin) : null;
  const pb = B.summary.data ? priceMap(B.summary.data, prefs.origin) : null;
  const both = pa && pb ? lines.filter((l) => pa[l.key] != null && pb[l.key] != null) : [];
  const listA = pa ? basketFromAverages(both, pa).total : null;
  const listB = pb ? basketFromAverages(both, pb).total : null;

  const fuelKeys = [...new Set([...(A.fuel?.rows ?? []), ...(B.fuel?.rows ?? [])].map((r) => r.key))];
  const asOf = (side: typeof A) => {
    const p = side.summary.data?.items[0]?.period;
    return p ? `${side.source?.kind === 'da' ? 'DA' : 'PSA'} · ${periodLabel(p)}` : '';
  };

  return (
    <View>
      <View style={s.heads}>
        <View style={s.headItem} />
        <View style={s.col}><Text style={s.headName} numberOfLines={2}>{A.name}</Text><Text style={s.headSub}>{t('here')}</Text></View>
        <Pressable onPress={onChange} style={s.col} accessibilityRole="button" accessibilityLabel={t('Change the second place')}>
          <Text style={s.headName} numberOfLines={2}>{B.name}</Text>
          <Text style={[s.headSub, { color: C.primary }]}>{t('Change')}</Text>
        </Pressable>
      </View>

      {listA != null && listB != null && both.length ? (
        <Card style={{ padding: 16 }}>
          <Text style={s.lead}>{t('Your Basket list')}</Text>
          <View style={s.bigRow}>
            <Text style={[s.big, cheaper(listA, listB) === 'a' && s.win]}>{peso(listA)}</Text>
            <Text style={[s.big, cheaper(listA, listB) === 'b' && s.win]}>{peso(listB)}</Text>
          </View>
          <Text style={s.note}>
            {cheaper(listA, listB)
              ? t('{amount} cheaper in {place}', { amount: peso(Math.abs(listA - listB)), place: listA < listB ? A.name : B.name })
              : t('About the same in both places')}
            {both.length < lines.length ? ` · ${t('{n} of your {total} items (priced in both)', { n: both.length, total: lines.length })}` : ''}
          </Text>
        </Card>
      ) : null}

      {fuelKeys.length || A.lpg || B.lpg ? (
        <>
          <SectionTitle>{t('Fuel & cooking gas')}</SectionTitle>
          <Card>
            {fuelKeys.map((k) => {
              const ra = A.fuel?.rows.find((r) => r.key === k);
              const rb = B.fuel?.rows.find((r) => r.key === k);
              return <Line key={k} title={(ra ?? rb)!.label} unit="L" a={ra?.price ?? null} b={rb?.price ?? null} />;
            })}
            {A.lpg || B.lpg ? (
              <Line title={t('LPG, 11 kg tank')} unit="tank" a={A.lpg?.summary.main ?? null} b={B.lpg?.summary.main ?? null} />
            ) : null}
          </Card>
        </>
      ) : null}

      {A.power || B.power || wA || wB ? (
        <>
          <SectionTitle>{t('Bills')}</SectionTitle>
          <Card>
            {A.power || B.power ? (
              <Line title={t('Electricity')} unit="kWh" a={A.power?.rate ?? null} b={B.power?.rate ?? null}
                sub={[A.power?.id ?? '—', B.power?.id ?? '—'].join(' · ')} />
            ) : null}
            {wA || wB ? (
              <Line title={t('Water')} unit="cu.m" a={wA?.rate ?? null} b={wB?.rate ?? null}
                sub={[wA?.name ?? '—', wB?.name ?? '—'].join(' · ')} />
            ) : null}
          </Card>
          <Text style={s.source}>
            {t('Electricity: residential rate of the utility you picked in the Electricity tab (Meralco where it serves). Water: Metro Manila concessionaires only, average all-in tariff.')}
          </Text>
        </>
      ) : null}

      {A.summary.loading || B.summary.loading ? <Loading /> : (
        <>
          {A.scope && A.scope === B.scope ? (
            <Notice>{t('Both places use the same food averages, so only fuel and LPG can differ.')}</Notice>
          ) : null}
          {GROUPS.map((g) => {
            const rows = food.filter((r) => r.cat === g);
            if (!rows.length) return null;
            return (
              <View key={g}>
                <SectionTitle>{tabLabel(g)}</SectionTitle>
                <Card>{rows.map((r) => <Line key={r.key} title={itemName(r.item)} unit={r.unit} a={r.a} b={r.b} />)}</Card>
              </View>
            );
          })}
          <Text style={s.source}>
            {A.name}: {asOf(A) || '—'} · {B.name}: {asOf(B) || '—'}.{' '}
            {t('Metro Manila food prices are daily DA averages; elsewhere PSA monthly averages, about a month behind.')}
          </Text>
        </>
      )}
    </View>
  );
}

function priceMap(file: SummaryFile, origin: OriginPref) {
  const out: Record<string, number> = {};
  for (const it of file.items) {
    const v = value(pickVariant(it, origin).last);
    if (v != null) out[it.key] = v;
  }
  return out;
}

function Line({ title, unit, a, b, sub }: { title: string; unit: string; a: number | null; b: number | null; sub?: string }) {
  const win = cheaper(a, b);
  const cell = (v: number | null, side: 'a' | 'b') => (
    <Text style={[s.cell, win === side && s.win]}>{v == null ? '—' : peso(v)}</Text>
  );
  return (
    <View style={s.line}>
      <View style={s.headItem}>
        <Text style={s.title} numberOfLines={3}>{title}</Text>
        <Text style={s.unit}>{UNIT_LABEL[unit] ?? `/${unit}`}{sub ? ` · ${sub}` : ''}</Text>
      </View>
      {cell(a, 'a')}
      {cell(b, 'b')}
    </View>
  );
}

const s = themed(() => ({
  heads: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 32, marginBottom: 10 },
  headItem: { flex: 1, minWidth: 0 },
  col: { width: 92, alignItems: 'flex-end' },
  headName: { fontSize: 14, fontWeight: '700', color: C.text, textAlign: 'right' },
  headSub: { fontSize: 12, color: C.muted, fontWeight: '600' },
  lead: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  bigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  big: { fontSize: 24, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  note: { fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 18 },
  line: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  title: { fontSize: 15, fontWeight: '600', color: C.text },
  unit: { fontSize: 12, color: C.muted },
  cell: { width: 92, textAlign: 'right', fontSize: 14, color: C.text, fontVariant: ['tabular-nums'] },
  win: { color: C.down, fontWeight: '700' },
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24, lineHeight: 17 },
}));
