import { useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';

import { t } from '../i18n';
import { CARD_SIZE, CardData, priceCardSvg } from '../lib/card';
import { C, PALETTES, themed } from '../theme';

/** SVG -> PNG file through a canvas (web only). */
async function toPng(svg: string, name: string): Promise<File> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error('card image failed to load'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CARD_SIZE;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('canvas export failed');
    return new File([blob], name, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const fileName = (title: string) => `presyo-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;

function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

/** "Share as image": a square price card for Facebook groups (phones share it, desktops save it).
 *  Web only for now; the native app keeps the text share. */
export function ShareImageButton({ card, text }: { card: Omit<CardData, 'colors'>; text: string }) {
  const [busy, setBusy] = useState(false);
  if (Platform.OS !== 'web') return null;
  const share = canShareFiles();

  const onPress = async () => {
    setBusy(true);
    try {
      const file = await toPng(priceCardSvg({ ...card, colors: PALETTES.light }), fileName(card.title));
      if (share) {
        await navigator.share({ files: [file], text });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch {
      // cancelled share sheet, or the browser can't draw the card
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable onPress={onPress} disabled={busy} style={s.btn} accessibilityRole="button">
      <Text style={s.text}>{busy ? t('Making image…') : share ? t('Share as image') : t('Save as image')}</Text>
    </Pressable>
  );
}

const s = themed(() => ({
  btn: { marginTop: 20, alignSelf: 'flex-start', paddingVertical: 8 },
  text: { color: C.primary, fontWeight: '600', fontSize: 14 },
}));
