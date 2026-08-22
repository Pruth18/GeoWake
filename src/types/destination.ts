import { z } from 'zod';

/** Google's guidance is a 100-150m floor for reliable geofence transitions. */
export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 5000;

/**
 * 500m is the default rather than the smallest option. Geofence dwell latency runs
 * under 2 minutes while moving but up to 6 minutes when the device has been stationary,
 * so a tight radius at commuter speed reliably overshoots the stop.
 */
export const DEFAULT_RADIUS_M = 500;

/** Offered in the picker. 200 is kept but labelled as unreliable — see RADIUS_NOTE. */
export const RADIUS_OPTIONS_M = [200, 500, 1000, 2000] as const;

export const RADIUS_NOTE: Record<number, string | undefined> = {
  200: 'May alert late at train speed',
};

export const destinationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Reverse-geocoded label. Absent for destinations set without saving. */
  address: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius: z.number().min(MIN_RADIUS_M).max(MAX_RADIUS_M),
  /** Epoch ms. Absent in v1 records; the migration backfills it. */
  createdAt: z.number().int().positive(),
});

export type Destination = z.infer<typeof destinationSchema>;

/**
 * v1 is what the foreground-only MVP wrote: a bare array under the `savedLocations`
 * key, with no envelope, no version marker and no createdAt. Real user data in this
 * shape exists on any device that ran the MVP, so it has to survive the upgrade.
 */
export const destinationV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius: z.number(),
});

export type DestinationV1 = z.infer<typeof destinationV1Schema>;

/**
 * Widen a v1 record to the current shape.
 *
 * Two v1 quirks are handled: radius was written unvalidated and could sit below the
 * usable floor (the MVP offered a 200m option and nothing stopped a smaller value),
 * and createdAt did not exist. v1 ids were `Date.now().toString()`, so where the id
 * parses as a plausible timestamp it is reused rather than inventing "now" and
 * reordering the user's list.
 */
export function migrateDestinationV1(v1: DestinationV1): Destination {
  return {
    id: v1.id,
    name: v1.name,
    address: v1.address,
    latitude: v1.latitude,
    longitude: v1.longitude,
    radius: clampRadius(v1.radius),
    createdAt: timestampFromLegacyId(v1.id),
  };
}

export function clampRadius(radius: number): number {
  if (!Number.isFinite(radius)) return DEFAULT_RADIUS_M;
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(radius)));
}

/** Earliest id we treat as a real timestamp rather than an arbitrary string. */
const PLAUSIBLE_EPOCH_MS = Date.UTC(2020, 0, 1);

function timestampFromLegacyId(id: string): number {
  const parsed = Number(id);
  const isTimestamp =
    Number.isInteger(parsed) && parsed >= PLAUSIBLE_EPOCH_MS && parsed <= Date.now();
  return isTimestamp ? parsed : Date.now();
}
