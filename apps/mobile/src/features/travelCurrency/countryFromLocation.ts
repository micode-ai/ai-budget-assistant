import { Platform } from 'react-native';
import * as Location from 'expo-location';

/**
 * Country (ISO alpha-2) for a coordinate via the OS geocoder. Native only; null on web or any
 * failure. Coordinates are never stored or sent to our servers by this path.
 */
export async function countryFromLocation(lat: number, lng: number): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return res[0]?.isoCountryCode?.toUpperCase() ?? null;
  } catch (e) {
    console.warn('[travelCurrency] reverse geocode failed:', e);
    return null;
  }
}
