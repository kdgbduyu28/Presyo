import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SheetProvider } from '../components/Sheet';
import { PrefsProvider, usePrefs } from '../lib/prefs';
import { WatchProvider } from '../lib/watch';
import { C, setScheme } from '../theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PrefsProvider>
          <ThemedRoot />
        </PrefsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Picks light/dark (setting or phone), then remounts the app under that
 *  palette: styles read colors when rendered, so a remount repaints all. */
function ThemedRoot() {
  const { prefs, ready, epoch } = usePrefs();
  const system = useColorScheme();
  const scheme = prefs.theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : prefs.theme;
  setScheme(scheme);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <View key={`${scheme}-${epoch}`} style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <WatchProvider>
        <SheetProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </SheetProvider>
      </WatchProvider>
    </View>
  );
}
