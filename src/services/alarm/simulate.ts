import { executeEffects } from './executeEffects';
import { handleGeofenceEvent } from './handleGeofenceEvent';
import { appendLog } from '../debugLog';
import { loadAlarmState } from '../storage';
import { GeofenceEventType, GEOFENCE_REGION_ID, type AlarmState } from '../../types';

/**
 * Drives a synthetic arrival through the REAL handler.
 *
 * Not a shortcut to the alarm: it constructs the exact payload shape TaskManager
 * delivers and runs it through the same handleGeofenceEvent + executeEffects path the
 * OS uses. A test affordance that bypassed the handler would prove nothing about the
 * thing that actually runs.
 */
export async function simulateArrival(): Promise<AlarmState> {
  const state = await loadAlarmState();

  if (state.status === 'idle') {
    await appendLog('warn', 'Simulated arrival ignored: no alarm is armed');
    return state;
  }

  const payload = {
    data: {
      eventType: GeofenceEventType.Enter,
      region: {
        identifier: GEOFENCE_REGION_ID,
        latitude: state.destination.latitude,
        longitude: state.destination.longitude,
        radius: state.destination.radius,
      },
    },
  };

  await appendLog('info', 'Simulated arrival dispatched', {
    destination: state.destination.name,
  });

  await executeEffects(handleGeofenceEvent({ payload, state, now: Date.now() }));
  return loadAlarmState();
}

export const DEFAULT_SIMULATE_DELAY_MS = 30_000;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The single most useful affordance in the project.
 *
 * A real lock-screen alarm cannot be verified by tapping a button and watching the
 * screen you are already looking at. This gives you time to lock the phone, put it in
 * a pocket, and let it settle — so the alarm has to wake a genuinely idle device,
 * which is the only test that means anything.
 */
export function scheduleSimulatedArrival(
  delayMs: number = DEFAULT_SIMULATE_DELAY_MS
): () => void {
  cancelSimulatedArrival();

  void appendLog('info', 'Simulated arrival scheduled', { delayMs });
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void simulateArrival();
  }, delayMs);

  return cancelSimulatedArrival;
}

export function cancelSimulatedArrival(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    void appendLog('info', 'Simulated arrival cancelled');
  }
}

export function hasPendingSimulation(): boolean {
  return pendingTimer !== null;
}
