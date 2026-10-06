import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SheetProvider } from '../components/Sheet';
import { WatchProvider } from '../lib/watch';
import { C } from '../theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <StatusBar style="dark" />
          <WatchProvider>
            <SheetProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
            </SheetProvider>
          </WatchProvider>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
