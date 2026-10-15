import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { fxPer } from '../lib/bills';
import { useJson } from '../lib/data';
import { lastTwo, peso, periodLabel } from '../lib/format';
import { usePrefs } from '../lib/prefs';
import { C, R, themed } from '../theme';
import { Chart } from './Chart';
import { Card, Chips, Columns, Delta, Loading, Notice, SectionTitle } from './bits';

type Currency = { code: string; name: string; s: (number | null)[] };
type ForexFile = {
  periods: string[];
  currencies: Currency[];
  bsp: { date?: string; bsp_ref?: number; bsp_buy?: number; bsp_sell?: number; gold_usd?: number; silver_usd?: number };
};

// What OFW families and travellers convert most; the rest are in the list below.
const QUICK = ['USD', 'SAR', 'AED', 'EUR', 'JPY', 'SGD', 'HKD', 'KRW', 'GBP', 'CAD', 'AUD', 'TWD'];

const money = (n: number, digits = 2) =>
  n.toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** BSP reference exchange rates: converter, USD buying/selling, history. */
export function ForexView({ wide }: { wide?: boolean }) {
  const fx = useJson<ForexFile>('forex.json');
  const { prefs, set } = usePrefs();
  const [amount, setAmount] = useState('100');
  const [toPeso, setToPeso] = useState(true);

  const latest = useMemo(() => {
    const out: Record<string, ReturnType<typeof lastTwo>> = {};
    for (const c of fx.data?.currencies ?? []) out[c.code] = lastTwo(c.s);
    return out;
  }, [fx.data]);

  if (fx.loading) return <Loading />;
  if (!fx.data?.currencies.length) return <Notice tone="warn">Exchange rates aren't available right now.</Notice>;
  const { periods, currencies, bsp } = fx.data;

  const code = currencies.some((c) => c.code === prefs.fx) ? prefs.fx : 'USD';
  const cur = currencies.find((c) => c.code === code)!;
  const { last, prev, lastIdx } = latest[code];
  const per = last ? fxPer(last) : 1;
  const amt = parseFloat(amount.replace(/,/g, ''));
  const converted = last && amt > 0 ? (toPeso ? amt * last : amt / last) : null;

  const converter = (
    <>
      <SectionTitle>Convert · BSP rate {periodLabel(periods[lastIdx])}</SectionTitle>
      <Card style={{ padding: 16 }}>
        <View style={s.convRow}>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={s.input}
            accessibilityLabel={`Amount in ${toPeso ? code : 'pesos'}`} selectTextOnFocus />
          <Text style={s.convUnit}>{toPeso ? code : 'PHP'}</Text>
          <Pressable onPress={() => setToPeso((v) => !v)} style={s.swap} hitSlop={8}
            accessibilityRole="button" accessibilityLabel="Swap direction">
            <Text style={s.swapText}>⇄</Text>
          </Pressable>
        </View>
        <Text style={s.result}>
          {converted == null ? '—' : toPeso ? peso(converted) : `${money(converted, converted < 1 ? 4 : 2)} ${code}`}
        </Text>
        <Text style={s.caption}>
          {cur.name} · {per > 1 ? `${per.toLocaleString()} ${code}` : `1 ${code}`} = {last ? peso(last * per) : '—'}
        </Text>
        <Delta last={last} prev={prev} />
        <View style={{ marginTop: 12 }}>
          <Chips options={QUICK.filter((q) => latest[q]?.last).map((q) => ({ id: q, label: q }))}
            value={code} onChange={(fxCode) => set({ fx: fxCode })} />
        </View>
        <Chart periods={periods} values={cur.s.map((v) => (v == null ? null : v * per))} height={130} />
        <Text style={s.caption}>
          Pesos per {per > 1 ? `${per.toLocaleString()} ` : ''}{code}. Banks and money changers buy lower and sell higher
          than this reference rate.
        </Text>
      </Card>

      {bsp.bsp_ref ? (
        <>
          <SectionTitle>US dollar at BSP · {bsp.date ? periodLabel(bsp.date) : ''}</SectionTitle>
          <Card>
            {[
              ['Reference rate', bsp.bsp_ref],
              ['BSP buying (T/T)', bsp.bsp_buy],
              ['BSP selling (T/T)', bsp.bsp_sell],
            ].map(([label, v]) => v ? (
              <View key={label as string} style={s.row}>
                <Text style={s.rowName}>{label}</Text>
                <Text style={s.rowPrice}>{peso(v as number)}</Text>
              </View>
            ) : null)}
            {bsp.gold_usd ? (
              <View style={s.row}>
                <Text style={s.rowName}>Gold, BSP buying</Text>
                <Text style={s.rowPrice}>${money(bsp.gold_usd)}<Text style={s.unit}>/oz</Text></Text>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}
    </>
  );

  const list = (
    <>
      <SectionTitle>All currencies · pesos per unit</SectionTitle>
      <Card>
        {currencies.map((c) => {
          const l = latest[c.code];
          if (l.last == null) return null;
          const k = fxPer(l.last);
          const on = c.code === code;
          return (
            <Pressable key={c.code} onPress={() => set({ fx: c.code })}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: C.bg }]}
              accessibilityRole="button" accessibilityState={{ selected: on }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowName, on && { color: C.primary }]}>{on ? '● ' : ''}{c.code}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{c.name}{k > 1 ? ` · per ${k.toLocaleString()}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.rowPrice}>{peso(l.last * k)}</Text>
                <Delta last={l.last} prev={l.prev} small />
              </View>
            </Pressable>
          );
        })}
      </Card>
      <Text style={s.source}>
        BSP Reference Exchange Rate Bulletin: rates as of the previous trading day (USD is the weighted average of
        the peso–dollar market). Change is vs the trading day before.
      </Text>
    </>
  );

  return <Columns wide={wide} left={converter} right={list} />;
}

const s = themed(() => ({
  convRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 18, color: C.text, backgroundColor: C.card, flex: 1, maxWidth: 180, textAlign: 'right',
  },
  convUnit: { fontSize: 16, fontWeight: '700', color: C.text },
  swap: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.line, marginLeft: 'auto',
  },
  swapText: { fontSize: 18, color: C.primary },
  result: { fontSize: 30, fontWeight: '800', color: C.text, marginTop: 10, fontVariant: ['tabular-nums'] },
  caption: { color: C.muted, fontSize: 13, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line,
  },
  rowName: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  rowPrice: { fontSize: 15, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, fontWeight: '400', color: C.muted },
  source: { fontSize: 12, color: C.faint, marginHorizontal: 16, marginBottom: 24 },
}));
