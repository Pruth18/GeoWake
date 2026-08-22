import { z } from 'zod';

import { destinationSchema, type Destination } from './destination';

/**
 * Mirrors expo-location's LocationGeofencingEventType (Enter = 1, Exit = 2).
 *
 * Declared locally rather than imported so the schema below can validate a raw
 * payload without pulling a native module into unit tests. The numeric values are
 * part of expo-location's public API and are asserted against the real enum in
 * alarm.test.ts, so drift fails a test rather than silently mis-parsing an event.
 */
export const GeofenceEventType = {
  Enter: 1,
  Exit: 2,
} as const;

export type GeofenceEventTypeValue =
  (typeof GeofenceEventType)[keyof typeof GeofenceEventType];

/**
 * Note `identifier` is optional in expo-location's LocationRegion. A region with no
 * identifier cannot be matched to a destination, so the handler must treat it as
 * unroutable rather than assuming it is the armed one.
 */
export const geofenceRegionSchema = z.object({
  identifier: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  radius: z.number(),
});

/**
 * The payload TaskManager hands us. It crosses the native boundary unvalidated, into
 * a headless process with no UI to report a parse failure — which is exactly why it
 * is parsed rather than cast.
 */
export const geofenceEventSchema = z.object({
  eventType: z.union([z.literal(GeofenceEventType.Enter), z.literal(GeofenceEventType.Exit)]),
  region: geofenceRegionSchema,
});

export type GeofenceEvent = z.infer<typeof geofenceEventSchema>;

/**
 * v1 kept exactly one alarm at a time, and so does this. A single armed alarm
 * collapses most of the state machine's branching, and multi-alarm support is not
 * worth its correctness cost before the single case is proven on real commutes.
 */
export const alarmStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }),
  z.object({
    status: z.literal('armed'),
    destination: destinationSchema,
    armedAt: z.number().int().positive(),
  }),
  z.object({
    status: z.literal('triggered'),
    destination: destinationSchema,
    armedAt: z.number().int().positive(),
    triggeredAt: z.number().int().positive(),
  }),
  z.object({
    status: z.literal('dismissed'),
    destination: destinationSchema,
    triggeredAt: z.number().int().positive(),
    dismissedAt: z.number().int().positive(),
  }),
]);

export type AlarmState = z.infer<typeof alarmStateSchema>;

export const IDLE_STATE: AlarmState = { status: 'idle' };

/** The region identifier registered with the OS for the single armed alarm. */
export const GEOFENCE_REGION_ID = 'geowake-destination';

export function isArmed(state: AlarmState): boolean {
  return state.status === 'armed';
}

export function activeDestination(state: AlarmState): Destination | undefined {
  return state.status === 'idle' ? undefined : state.destination;
}
