import {
  clampRadius,
  destinationSchema,
  destinationV1Schema,
  migrateDestinationV1,
  DEFAULT_RADIUS_M,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
} from '../destination';

/** Exactly what the foreground-only MVP wrote for a saved location. */
const v1Saved = {
  id: '1699999999999',
  name: 'Kings Cross',
  address: 'Euston Road, London, England, UK',
  latitude: 51.5308,
  longitude: -0.1238,
  radius: 500,
};

/** What the MVP wrote for "Set Alarm Only" — no address, prefixed id. */
const v1Temp = {
  id: 'temp-1699999999999',
  name: 'Selected Location',
  latitude: 51.5308,
  longitude: -0.1238,
  radius: 200,
};

describe('destinationV1Schema', () => {
  it('accepts a saved MVP record', () => {
    expect(destinationV1Schema.safeParse(v1Saved).success).toBe(true);
  });

  it('accepts an MVP record with no address', () => {
    expect(destinationV1Schema.safeParse(v1Temp).success).toBe(true);
  });

  it('rejects a record missing coordinates', () => {
    const { latitude, ...noLat } = v1Saved;
    expect(destinationV1Schema.safeParse(noLat).success).toBe(false);
  });

  it('rejects a radius stored as a string', () => {
    // The MVP never validated what it wrote, so this shape is possible in the wild.
    expect(destinationV1Schema.safeParse({ ...v1Saved, radius: '500' }).success).toBe(false);
  });
});

describe('migrateDestinationV1', () => {
  it('preserves the identifying fields', () => {
    const migrated = migrateDestinationV1(v1Saved);
    expect(migrated).toMatchObject({
      id: v1Saved.id,
      name: v1Saved.name,
      address: v1Saved.address,
      latitude: v1Saved.latitude,
      longitude: v1Saved.longitude,
      radius: 500,
    });
  });

  it('produces a record the current schema accepts', () => {
    expect(destinationSchema.safeParse(migrateDestinationV1(v1Saved)).success).toBe(true);
    expect(destinationSchema.safeParse(migrateDestinationV1(v1Temp)).success).toBe(true);
  });

  it('recovers createdAt from a timestamp-shaped legacy id', () => {
    // v1 ids were Date.now().toString(). Reusing them keeps the user's list in the
    // order they created it instead of collapsing everything to "now".
    expect(migrateDestinationV1(v1Saved).createdAt).toBe(1699999999999);
  });

  it('falls back to now for a non-timestamp id', () => {
    const before = Date.now();
    const migrated = migrateDestinationV1({ ...v1Saved, id: 'temp-abc' });
    expect(migrated.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('does not treat an implausibly old numeric id as a timestamp', () => {
    const before = Date.now();
    const migrated = migrateDestinationV1({ ...v1Saved, id: '42' });
    expect(migrated.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('raises a below-floor radius to the usable minimum', () => {
    // The MVP wrote radius unvalidated. Anything under ~100m cannot fire reliably.
    expect(migrateDestinationV1({ ...v1Saved, radius: 25 }).radius).toBe(MIN_RADIUS_M);
  });

  it('caps an absurd radius', () => {
    expect(migrateDestinationV1({ ...v1Saved, radius: 999_999 }).radius).toBe(MAX_RADIUS_M);
  });
});

describe('clampRadius', () => {
  it.each([
    [500, 500],
    [100, 100],
    [99, MIN_RADIUS_M],
    [0, MIN_RADIUS_M],
    [-10, MIN_RADIUS_M],
    [5000, 5000],
    [5001, MAX_RADIUS_M],
  ])('clamps %p to %p', (input, expected) => {
    expect(clampRadius(input)).toBe(expected);
  });

  it('rounds fractional radii', () => {
    expect(clampRadius(500.6)).toBe(501);
  });

  it('falls back to the default for NaN rather than producing an unusable fence', () => {
    expect(clampRadius(Number.NaN)).toBe(DEFAULT_RADIUS_M);
    expect(clampRadius(Number.POSITIVE_INFINITY)).toBe(DEFAULT_RADIUS_M);
  });
});

describe('destinationSchema', () => {
  const valid = migrateDestinationV1(v1Saved);

  it('rejects out-of-range coordinates', () => {
    expect(destinationSchema.safeParse({ ...valid, latitude: 91 }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, longitude: -181 }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(destinationSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects a radius below the reliable floor', () => {
    expect(destinationSchema.safeParse({ ...valid, radius: 50 }).success).toBe(false);
  });
});
