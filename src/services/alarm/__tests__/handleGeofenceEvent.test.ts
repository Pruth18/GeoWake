import { handleGeofenceEvent } from '../handleGeofenceEvent';
import {
  GeofenceEventType,
  GEOFENCE_REGION_ID,
  type AlarmEffect,
  type AlarmState,
  type Destination,
} from '../../../types';

const NOW = 1_700_000_100_000;
const ARMED_AT = 1_700_000_000_000;

const destination: Destination = {
  id: 'd1',
  name: 'Kings Cross',
  latitude: 51.5308,
  longitude: -0.1238,
  radius: 500,
  createdAt: ARMED_AT,
};

const armed: AlarmState = { status: 'armed', destination, armedAt: ARMED_AT };
const triggered: AlarmState = {
  status: 'triggered',
  destination,
  armedAt: ARMED_AT,
  triggeredAt: NOW - 1000,
};
const dismissed: AlarmState = {
  status: 'dismissed',
  destination,
  triggeredAt: NOW - 2000,
  dismissedAt: NOW - 1000,
};

/** Pass null to omit the identifier entirely — `undefined` would hit the default. */
function enterPayload(identifier: string | null = GEOFENCE_REGION_ID) {
  return {
    data: {
      eventType: GeofenceEventType.Enter,
      region: {
        ...(identifier === null ? {} : { identifier }),
        latitude: destination.latitude,
        longitude: destination.longitude,
        radius: destination.radius,
      },
    },
  };
}

const run = (payload: unknown, state: AlarmState) =>
  handleGeofenceEvent({ payload, state, now: NOW });

const has = (effects: AlarmEffect[], type: AlarmEffect['type']) =>
  effects.some((e) => e.type === type);

describe('the arrival case', () => {
  it('starts the alarm on ENTER for the armed region', () => {
    const effects = run(enterPayload(), armed);
    expect(has(effects, 'startAlarm')).toBe(true);
  });

  it('transitions armed -> triggered and records when', () => {
    const effects = run(enterPayload(), armed);
    const persist = effects.find((e) => e.type === 'persistState');

    expect(persist).toEqual({
      type: 'persistState',
      state: { status: 'triggered', destination, armedAt: ARMED_AT, triggeredAt: NOW },
    });
  });

  it('deregisters the region so re-entry cannot re-fire', () => {
    // Without this the OS keeps the fence; stepping out and back in — trivially easy
    // on a platform, or just GPS jitter at the boundary — fires the alarm again.
    expect(has(run(enterPayload(), armed), 'stopGeofencing')).toBe(true);
  });

  it('carries the armed destination, not one derived from the event region', () => {
    const effects = run(enterPayload(), armed);
    const start = effects.find((e) => e.type === 'startAlarm');
    expect(start).toEqual({ type: 'startAlarm', destination });
  });
});

describe('re-entry after triggering', () => {
  /**
   * This is the MVP's stale-closure bug, relocated to where it belongs.
   *
   * The old AlarmScreen captured alarmTriggered === false in a [] effect, so every
   * position update inside the radius called triggerAlarm() again — stacking Alerts
   * and restarting the vibration, with "Stop Alarm" unable to hold. Expressed as a
   * state-machine invariant, it simply cannot recur: triggered is terminal for ENTER.
   */
  it('is a no-op when already triggered', () => {
    const effects = run(enterPayload(), triggered);
    expect(has(effects, 'startAlarm')).toBe(false);
    expect(has(effects, 'persistState')).toBe(false);
  });

  it('does not restart the alarm after the user dismissed it', () => {
    const effects = run(enterPayload(), dismissed);
    expect(has(effects, 'startAlarm')).toBe(false);
    expect(has(effects, 'persistState')).toBe(false);
  });

  it('still logs the ignored event so it is visible after the fact', () => {
    // The handler runs headless; if it silently does nothing there is no way to tell
    // "correctly ignored" from "never fired" when debugging a missed stop.
    expect(has(run(enterPayload(), triggered), 'log')).toBe(true);
  });
});

describe('events that must not trigger', () => {
  it('ignores EXIT', () => {
    const payload = {
      data: {
        eventType: GeofenceEventType.Exit,
        region: { identifier: GEOFENCE_REGION_ID, latitude: 1, longitude: 2, radius: 500 },
      },
    };
    expect(has(run(payload, armed), 'startAlarm')).toBe(false);
  });

  it('ignores ENTER while idle', () => {
    // A fence with no armed alarm behind it should not exist. If one fires, the right
    // response is to tear it down, not to invent a destination.
    const effects = run(enterPayload(), { status: 'idle' });
    expect(has(effects, 'startAlarm')).toBe(false);
    expect(has(effects, 'stopGeofencing')).toBe(true);
  });

  it('ignores a region id from a previous alarm', () => {
    // Geofences outlive the app. A fence registered under an older id can still fire
    // after the user has armed something else entirely.
    const effects = run(enterPayload('geowake-destination-OLD'), armed);
    expect(has(effects, 'startAlarm')).toBe(false);
    expect(has(effects, 'persistState')).toBe(false);
  });

  it('does NOT tear down geofencing when armed, even for an unrecognised region', () => {
    // stopGeofencingAsync takes a task name, not a region — it removes every region
    // registered to that task. Tearing down in response to an event we do not
    // understand would disarm the user's actual alarm. A stray log is a far better
    // failure than a silently disarmed wake-up, so an armed alarm is never disturbed
    // by an unrecognised event. The idle case below is different: nothing to protect.
    const effects = run(enterPayload('geowake-destination-OLD'), armed);
    expect(has(effects, 'stopGeofencing')).toBe(false);
    expect(has(effects, 'log')).toBe(true);
  });

  it('does not disturb an armed alarm on an unidentified region either', () => {
    const effects = run(enterPayload(null), armed);
    expect(has(effects, 'stopGeofencing')).toBe(false);
    expect(has(effects, 'persistState')).toBe(false);
  });

  it('ignores a region with no identifier', () => {
    // identifier is optional in expo-location's LocationRegion, so an unroutable
    // region is a real case — it must not be assumed to be the armed one.
    const effects = run(enterPayload(null), armed);
    expect(has(effects, 'startAlarm')).toBe(false);
  });
});

describe('bad input', () => {
  it('logs an error payload without triggering', () => {
    const effects = run({ error: { message: 'location services unavailable' } }, armed);
    expect(has(effects, 'startAlarm')).toBe(false);
    const log = effects.find((e) => e.type === 'log');
    expect(log && log.type === 'log' && log.level).toBe('error');
  });

  it('leaves the alarm armed when the task reports an error', () => {
    // A transient failure must not silently disarm — the user still expects a wake-up.
    const effects = run({ error: { message: 'transient' } }, armed);
    expect(has(effects, 'persistState')).toBe(false);
    expect(has(effects, 'stopGeofencing')).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'not an event'],
    ['an empty object', {}],
    ['a malformed event type', { data: { eventType: 99, region: {} } }],
    ['a region with no coordinates', { data: { eventType: 1, region: { identifier: 'x' } } }],
  ])('does not throw or trigger on %s', (_label, payload) => {
    let effects: AlarmEffect[] = [];
    expect(() => {
      effects = run(payload, armed);
    }).not.toThrow();
    expect(has(effects, 'startAlarm')).toBe(false);
  });

  it('reports a malformed payload rather than failing silently', () => {
    const effects = run({ data: { eventType: 99, region: {} } }, armed);
    const log = effects.find((e) => e.type === 'log');
    expect(log && log.type === 'log' && log.level).toBe('error');
  });
});

describe('purity', () => {
  it('does not mutate the state it is given', () => {
    const state: AlarmState = { status: 'armed', destination, armedAt: ARMED_AT };
    const snapshot = JSON.parse(JSON.stringify(state));
    run(enterPayload(), state);
    expect(state).toEqual(snapshot);
  });

  it('returns the same effects for the same inputs', () => {
    expect(run(enterPayload(), armed)).toEqual(run(enterPayload(), armed));
  });
});

describe('unreadable state', () => {
  /**
   * The compounding failure this guards against.
   *
   * A failed storage read also yields `idle`, and an arrival while idle deregisters the
   * fence as an orphan. Without distinguishing the two, ONE transient AsyncStorage
   * failure would both miss the alarm and destroy it permanently — reconcile reads the
   * same `idle` and would never re-arm it.
   */
  it('never tears down a fence when the state could not be read', () => {
    const effects = handleGeofenceEvent({
      payload: enterPayload(),
      state: { status: 'idle' },
      now: NOW,
      stateReadOk: false,
    });

    expect(has(effects, 'stopGeofencing')).toBe(false);
    expect(has(effects, 'startAlarm')).toBe(false);
    expect(has(effects, 'persistState')).toBe(false);
  });

  it('reports the unreadable state as an error', () => {
    const effects = handleGeofenceEvent({
      payload: enterPayload(),
      state: { status: 'idle' },
      now: NOW,
      stateReadOk: false,
    });

    const log = effects.find((e) => e.type === 'log');
    expect(log && log.type === 'log' && log.level).toBe('error');
  });

  it('still tears down an orphan when the state was genuinely readable', () => {
    // The contrast that makes the guard meaningful: a real idle IS cleaned up.
    const effects = handleGeofenceEvent({
      payload: enterPayload(),
      state: { status: 'idle' },
      now: NOW,
      stateReadOk: true,
    });

    expect(has(effects, 'stopGeofencing')).toBe(true);
  });

  it('defaults to treating state as readable', () => {
    const effects = handleGeofenceEvent({ payload: enterPayload(), state: armed, now: NOW });
    expect(has(effects, 'startAlarm')).toBe(true);
  });
});
