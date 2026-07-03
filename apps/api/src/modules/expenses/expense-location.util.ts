export interface LocationInput {
  lat: number;
  lng: number;
  name?: string;
}

/**
 * Map the DTO `location` object onto the three Prisma columns.
 * undefined → leave columns untouched; null → clear all three;
 * object without `name` → coordinates set, stale name cleared.
 */
export function buildLocationColumns(location: LocationInput | null | undefined): {
  locationLat: number | null | undefined;
  locationLng: number | null | undefined;
  locationName: string | null | undefined;
} {
  if (location === undefined) {
    return { locationLat: undefined, locationLng: undefined, locationName: undefined };
  }
  if (location === null) {
    return { locationLat: null, locationLng: null, locationName: null };
  }
  return { locationLat: location.lat, locationLng: location.lng, locationName: location.name ?? null };
}
