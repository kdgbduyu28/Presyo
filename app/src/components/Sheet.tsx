import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, MAX_WIDTH } from '../theme';

type Open = { title?: string; body: ReactNode; onClose?: () => void } | null;
const Ctx = createContext<(s: Open) => void>(() => {});

/** Renders the one open sheet above the whole screen. Sheets are opened from
 *  inside scroll views, so drawing them in place would clip them. */
export function SheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => {
    open?.onClose?.();
    setOpen(null);
  }, [open]);
  return (
    <Ctx.Provider value={setOpen}>
      {children}
      {open ? <Panel title={open.title} onClose={close}>{open.body}</Panel> : null}
    </Ctx.Provider>
  );
}

/** Declarative sheet: shows `children` at the root while `open` is true. */
export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode;
}) {
  const show = useContext(Ctx);
  const body = useMemo(() => children, [children]);
  useEffect(() => {
    show(open ? { title, body, onClose } : null);
  }, [open, title, body, onClose, show]);
  useEffect(() => () => show(null), [show]);
  return null;
}

function Panel({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </View>
      <View style={s.dock} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.duration(240)}
          exiting={SlideOutDown.duration(180)}
          style={[s.panel, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <View style={s.head}>
            <Text style={s.title} numberOfLines={2}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={s.close}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.overlay },
  dock: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'center' },
  panel: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    maxHeight: '88%',
    backgroundColor: C.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text },
  close: { fontSize: 18, color: C.muted },
  body: { paddingHorizontal: 16, paddingBottom: 8 },
});
