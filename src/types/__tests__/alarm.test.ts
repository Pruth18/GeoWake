import { LocationGeofencingEventType } from 'expo-location';

import {
  activeDestination,
  alarmStateSchema,
  geofenceEventSchema,
  isArmed,
  GeofenceEventType,
  type AlarmState,
  type Destination,
} from '..';

const destination: Destination = {
  id: 'd1',
  name: 'Kings Cross',
  latitude: 51.5308,
  longitude: -0.1238,
  radius: 500,
  createdAt: 1_700_000_000_000,
};

describe('GeofenceEventType', () => {
  /**
   * alarm.ts declares these values locally so the schema can validate a raw payload
   * without importing a native module. That is only safe while the numbers agree with
   * expo-location. If a future SDK renumbers them, this fails loudly instead of the
   * app silently ignoring every arrival.
   */
  it('matches expo-location LocationGeofencingEventType', () => {
    expect(GeofenceEventType.Enter).toBe(LocationGeofencingEventType.Enter);
    expect(GeofenceEventType.Exit).toBe(LocationGeofencingEventType.Exit);
  });
});

describe('geofenceEventSchema', () => {
  const region = {
    identifier: 'geowake-destination',
    latitude: 51.5308,
    longitude: -0.1238,
    radius: 500,
  };

  it('accepts a well-formed Enter event', () => {
    const parsed = geofenceEventSchema.safeParse({
      eventType: GeofenceEventType.Enter,
      region,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a region with no identifier', () => {
    // identifier is optional in expo-location's LocationRegion, so the handler has to
    // cope with it being absent rather than assuming it is the armed region.
    const { identifier, ...anonymous } = region;
    const parsed = geofenceEventSchema.safeParse({
      eventType: GeofenceEventType.Enter,
      region: anonymous,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown event type', () => {
    expect(
      geofenceEventSchema.safeParse({ eventType: 99, region }).success
    ).toBe(false);
  });

  it('rejects a payload with no region', () => {
    expect(
      geofenceEventSchema.safeParse({ eventType: GeofenceEventType.Enter }).success
    ).toBe(false);
  });

  it('rejects a region with non-numeric coordinates', () => {
    expect(
      geofenceEventSchema.safeParse({
        eventType: GeofenceEventType.Enter,
        region: { ...region, latitude: '51.5' },
      }).success
    ).toBe(false);
  });
});

describe('alarmStateSchema', () => {
  it.each([
    ['idle', { status: 'idle' }],
    ['armed', { status: 'armed', destination, armedAt: 1 }],
    ['triggered', { status: 'triggered', destination, armedAt: 1, triggeredAt: 2 }],
    ['dismissed', { status: 'dismissed', destination, triggeredAt: 2, dismissedAt: 3 }],
  ])('accepts a %s state', (_label, state) => {
    expect(alarmStateSchema.safeParse(state).success).toBe(true);
  });

  it('rejects an armed state with no destination', () => {
    expect(alarmStateSchema.safeParse({ status: 'armed', armedAt: 1 }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(alarmStateSchema.safeParse({ status: 'snoozed' }).success).toBe(false);
  });
});

describe('state helpers', () => {
  const armed: AlarmState = { status: 'armed', destination, armedAt: 1 };
  const triggered: AlarmState = { status: 'triggered', destination, armedAt: 1, triggeredAt: 2 };

  it('isArmed is true only for armed', () => {
    expect(isArmed(armed)).toBe(true);
    expect(isArmed(triggered)).toBe(false);
    expect(isArmed({ status: 'idle' })).toBe(false);
  });

  it('activeDestination returns undefined only when idle', () => {
    expect(activeDestination(armed)).toEqual(destination);
    expect(activeDestination(triggered)).toEqual(destination);
    expect(activeDestination({ status: 'idle' })).toBeUndefined();
  });
});
