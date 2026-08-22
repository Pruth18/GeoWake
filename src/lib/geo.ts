/** Mean Earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

export type Coordinates = {
  latitude: number;
  longitude: number;
};

/**
 * Great-circle distance between two points, in METRES.
 *
 * The MVP had two copies of this returning kilometres, which forced every caller to
 * write `distance <= radius / 1000` against a radius that was already in metres. That
 * conversion is the kind of thing that is wrong by a factor of 1000 without anyone
 * noticing. Metres in, metres out, no conversion at any call site.
 */
export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** True when `point` lies within `radiusMeters` of `centre`. */
export function isWithinRadius(
  point: Coordinates,
  centre: Coordinates,
  radiusMeters: number
): boolean {
  return distanceMeters(point, centre) <= radiusMeters;
}

/** Human-readable distance: metres under 1km, otherwise kilometres to one decimal. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
