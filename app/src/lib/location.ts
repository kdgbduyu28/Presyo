import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

export type Spot = {
  lat: number;
  lng: number;
  /** 'gps' = from the device; 'pick' = the user chose a city. */
  via: 'gps' | 'pick';
};

const KEY = 'presyo.spot.v1';

export async function locate(): Promise<Spot> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission was not granted.');
  // A city-level fix is all we need, so prefer a quick cached position.
  const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000, requiredAccuracy: 5000 });
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, via: 'gps' };
}

/** The user's saved spot (undefined while reading storage, null if none yet). */
export function useSpot() {
  const [spot, setSpotState] = useState<Spot | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => setSpotState(raw ? (JSON.parse(raw) as Spot) : null))
      .catch(() => setSpotState(null));
  }, []);

  const setSpot = useCallback((s: Spot) => {
    setSpotState(s);
    AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
  }, []);

  return [spot, setSpot] as const;
}
