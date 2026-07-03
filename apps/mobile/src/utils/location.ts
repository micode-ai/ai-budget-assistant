/**
 * Build the mobile nested `location` object from the API's flat columns.
 * The server serializes Prisma Decimal as strings, so coerce with Number().
 */
export function parseServerLocation(raw: {
  locationLat?: unknown;
  locationLng?: unknown;
  locationName?: unknown;
}): { lat: number; lng: number; name?: string } | undefined {
  if (raw.locationLat == null || raw.locationLng == null) return undefined;
  const lat = Number(raw.locationLat);
  const lng = Number(raw.locationLng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return undefined;
  const name =
    typeof raw.locationName === 'string' && raw.locationName.length > 0
      ? raw.locationName
      : undefined;
  return { lat, lng, name };
}
