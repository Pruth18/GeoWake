import {
  geofenceEventSchema,
  GeofenceEventType,
  GEOFENCE_REGION_ID,
  type AlarmEffect,
  type AlarmState,
} from '../../types';

export type HandleGeofenceInput = {
  /** The raw `{ data, error }` object TaskManager hands the task. Never trusted. */
  payload: unknown;
  /** State as loaded from storage — the only thing a headless wake-up knows. */
  state: AlarmState;
  /**
   * Whether that state was actually readable. Defaults to true.
   *
   * A failed read yields `idle`, and an arrival while idle deregisters the fence. Acting
   * on state we could not read would turn one transient storage failure into a
   * permanently destroyed alarm.
   */
  stateReadOk?: boolean;
  /** Injected so the result is deterministic and testable. */
  now: number;
};

/**
 * Decides what a geofence event means. Pure: no I/O, no clock, no mutation.
 *
 * This is the whole reliability story of the app. It runs headless, minutes into a
 * commute, on a device nobody is looking at — so it is written as a function whose
 * every branch can be exercised in milliseconds with no device, no location and no
 * emulator. The task handler around it does nothing but read state, call this, and
 * execute what it returns.
 */
export function handleGeofenceEvent({
  payload,
  state,
  now,
  stateReadOk = true,
}: HandleGeofenceInput): AlarmEffect[] {
  const envelope = asEnvelope(payload);

  if (envelope.error !== undefined && envelope.error !== null) {
    // Leave the alarm armed. A transient location failure must not silently disarm a
    // wake-up the user is still relying on.
    return [
      {
        type: 'log',
        level: 'error',
        message: 'Geofence task reported an error',
        data: { error: describe(envelope.error), status: state.status },
      },
    ];
  }

  const parsed = geofenceEventSchema.safeParse(envelope.data);
  if (!parsed.success) {
    return [
      {
        type: 'log',
        level: 'error',
        message: 'Geofence payload did not match the expected shape',
        data: { status: state.status, issue: parsed.error.issues[0]?.message },
      },
    ];
  }

  const event = parsed.data;

  if (event.eventType !== GeofenceEventType.Enter) {
    return [
      {
        type: 'log',
        level: 'info',
        message: 'Ignoring non-arrival geofence event',
        data: { eventType: event.eventType, status: state.status },
      },
    ];
  }

  // We could not read our own state, so `idle` here means "unknown", not "nothing
  // armed". Do nothing: leaving a fence registered costs a wasted wake-up, whereas
  // removing one the user is relying on costs them their stop, permanently.
  if (!stateReadOk) {
    return [
      {
        type: 'log',
        level: 'error',
        message: 'Arrival received but alarm state was unreadable; taking no action',
        data: { region: event.region.identifier ?? null },
      },
    ];
  }

  // An arrival with no armed alarm behind it means the OS is holding a fence we no
  // longer want — the app was reinstalled, storage was cleared, or a disarm did not
  // complete. Nothing to protect here, so clean it up.
  if (state.status === 'idle') {
    return [
      {
        type: 'log',
        level: 'warn',
        message: 'Arrival fired with no armed alarm; removing orphaned region',
        data: { region: event.region.identifier ?? null },
      },
      { type: 'stopGeofencing', reason: 'orphaned-region' },
    ];
  }

  // Geofences outlive the process, so a region from an earlier alarm can still fire.
  // Deliberately does NOT stop geofencing: stopGeofencingAsync removes every region
  // for the task, which would disarm the live alarm in response to an event we do not
  // understand.
  if (event.region.identifier !== GEOFENCE_REGION_ID) {
    return [
      {
        type: 'log',
        level: 'warn',
        message: 'Ignoring arrival for an unrecognised region',
        data: {
          region: event.region.identifier ?? null,
          expected: GEOFENCE_REGION_ID,
          status: state.status,
        },
      },
    ];
  }

  // Already handled. This is the MVP's repeat-trigger bug expressed as an invariant:
  // once triggered, arrival is terminal until the alarm is re-armed.
  if (state.status === 'triggered' || state.status === 'dismissed') {
    return [
      {
        type: 'log',
        level: 'info',
        message: 'Arrival already handled; ignoring repeat',
        data: { status: state.status, destination: state.destination.name },
      },
    ];
  }

  return [
    {
      type: 'log',
      level: 'info',
      message: 'Arrival detected',
      data: { destination: state.destination.name, radius: state.destination.radius },
    },
    {
      type: 'persistState',
      state: {
        status: 'triggered',
        destination: state.destination,
        armedAt: state.armedAt,
        triggeredAt: now,
      },
    },
    { type: 'startAlarm', destination: state.destination },
    // The fence has done its job. Left registered, GPS jitter at the boundary or
    // simply stepping off and back onto a platform would fire it again.
    { type: 'stopGeofencing', reason: 'arrived' },
  ];
}

function asEnvelope(payload: unknown): { data?: unknown; error?: unknown } {
  if (typeof payload !== 'object' || payload === null) return {};
  return payload as { data?: unknown; error?: unknown };
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'unknown error';
}
