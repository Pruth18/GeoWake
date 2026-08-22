import { distanceMeters, formatDistance, isWithinRadius } from '../geo';

const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const PARIS = { latitude: 48.8566, longitude: 2.3522 };

describe('distanceMeters', () => {
  it('returns zero for identical points', () => {
    expect(distanceMeters(LONDON, LONDON)).toBe(0);
  });

  it('matches a known city-to-city distance', () => {
    // London to Paris is ~343.5 km great-circle. 1% tolerance covers the difference
    // between mean-radius and ellipsoidal models.
    expect(distanceMeters(LONDON, PARIS)).toBeCloseTo(343_500, -3);
  });

  it('returns metres, not kilometres', () => {
    // One degree of latitude is ~111 km. The MVP returned km here and every caller
    // then divided its radius by 1000 to compensate — this asserts the unit directly.
    const oneDegreeNorth = { latitude: LONDON.latitude + 1, longitude: LONDON.longitude };
    const d = distanceMeters(LONDON, oneDegreeNorth);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('is symmetric', () => {
    expect(distanceMeters(LONDON, PARIS)).toBeCloseTo(distanceMeters(PARIS, LONDON), 6);
  });

  it('handles the antimeridian without blowing up', () => {
    const west = { latitude: 0, longitude: 179.9 };
    const east = { latitude: 0, longitude: -179.9 };
    // 0.2 degrees of longitude at the equator is ~22 km — not most of the way round.
    expect(distanceMeters(west, east)).toBeLessThan(25_000);
  });

  it('handles antipodal points without NaN from floating-point drift', () => {
    const north = { latitude: 90, longitude: 0 };
    const south = { latitude: -90, longitude: 0 };
    const d = distanceMeters(north, south);
    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBeCloseTo(20_015_000, -4);
  });
});

describe('isWithinRadius', () => {
  const centre = LONDON;

  it('is true at the centre', () => {
    expect(isWithinRadius(centre, centre, 100)).toBe(true);
  });

  it('is false well outside', () => {
    expect(isWithinRadius(PARIS, centre, 500)).toBe(false);
  });

  it('is inclusive at the boundary', () => {
    // A point ~500m north. Radius exactly equal to the distance must count as inside:
    // a geofence that excludes its own boundary would drop arrivals that land on it.
    const north = { latitude: centre.latitude + 500 / 111_195, longitude: centre.longitude };
    const d = distanceMeters(north, centre);
    expect(isWithinRadius(north, centre, d)).toBe(true);
  });
});

describe('formatDistance', () => {
  it.each([
    [0, '0 m'],
    [1, '1 m'],
    [999, '999 m'],
    [1000, '1.0 km'],
    [1500, '1.5 km'],
    [343_500, '343.5 km'],
  ])('formats %p as %p', (input, expected) => {
    expect(formatDistance(input)).toBe(expected);
  });

  it('returns a placeholder for unusable input rather than "NaN m"', () => {
    expect(formatDistance(Number.NaN)).toBe('—');
    expect(formatDistance(-5)).toBe('—');
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
