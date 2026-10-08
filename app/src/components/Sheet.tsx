import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { SlideInDown, SlideInRight, SlideOutDown, SlideOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, MAX_WIDTH, themed, WIDE } from '../theme';

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
  const wide = useWindowDimensions().width >= WIDE;

  // Esc closes the sheet on the web.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // capture phase: focused pressables handle key events themselves
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[s.backdrop, wide && s.backdropWide]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </View>
      {/* Phones: bottom sheet. Wide screens: side panel next to the list. */}
      <View style={[s.dock, wide && s.dockWide]} pointerEvents="box-none">
        <Animated.View
          entering={wide ? SlideInRight.duration(220) : SlideInDown.duration(240)}
          exiting={wide ? SlideOutRight.duration(160) : SlideOutDown.duration(180)}
          style={[wide ? s.side : s.panel, { paddingBottom: Math.max(insets.bottom, 12), paddingTop: wide ? insets.top : 0 }]}
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

const s = themed(() => ({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.overlay },
  backdropWide: { backgroundColor: 'rgba(0,0,0,0.25)' },
  dock: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'center' },
  dockWide: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'stretch' },
  side: {
    width: 460,
    height: '100%',
    backgroundColor: C.card,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: C.line,
  },
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
}));
