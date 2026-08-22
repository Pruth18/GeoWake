import * as Location from 'expo-location';
import { AppState, type AppStateStatus } from 'react-native';

import { GEOFENCE_TASK_NAME } from '../tasks/constants';
import { GEOFENCE_REGION_ID, IDLE_STATE, type Destination } from '../types';
import { appendLog } from './debugLog';
import { loadAlarmState, saveAlarmState } from './storage';

/**
 * Arms exactly one alarm, replacing whatever was armed before.
 *
 * startGeofencingAsync replaces the entire region set for the task, so there is no way
 * to accumulate stale regions through this path — which is what makes the single-alarm
 * constraint enforceable rather than merely intended.
 */
export async function armAlarm(destination: Destination): Promise<void> {
  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [
    {
      identifier: GEOFENCE_REGION_ID,
      latitude: destination.latitude,
      longitude: destination.longitude,
      radius: destination.radius,
      notifyOnEnter: true,
      // We only care about arrival. Asking for exits doubles the events the OS wakes
      // us for, and every wake-up costs battery on a device in someone's pocket.
      notifyOnExit: false,
    },
  ]);

  await saveAlarmState({ status: 'armed', destination, armedAt: Date.now() });
  await appendLog('info', 'Alarm armed', {
    destination: destination.name,
    radius: destination.radius,
  });
}

export async function disarmAlarm(reason: string): Promise<void> {
  await stopGeofencing(reason);
  await saveAlarmState(IDLE_STATE);
  await appendLog('info', 'Alarm disarmed', { reason });
}

/**
 * Marks a triggered alarm as dealt with.
 *
 * Kept distinct from disarming: `dismissed` records that the user was actually woken
 * and acknowledged it, which is what the arrival log needs to show during Phase 5
 * dogfooding. It also makes a repeat arrival a provable no-op rather than relying on
 * the fence already being gone.
 */
export async function dismissAlarm(): Promise<void> {
  const state = await loadAlarmState();
  if (state.status !== 'triggered') {
    await appendLog('warn', 'Dismiss requested but no alarm was ringing', {
      status: state.status,
    });
    return;
  }

  await saveAlarmState({
    status: 'dismissed',
    destination: state.destination,
    triggeredAt: state.triggeredAt,
    dismissedAt: Date.now(),
  });
  await appendLog('info', 'Alarm dismissed', {
    destination: state.destination.name,
    ringingForMs: Date.now() - state.triggeredAt,
  });
}

/**
 * Removes every region for the task. Safe to call when nothing is registered.
 */
export async function stopGeofencing(reason: string): Promise<void> {
  try {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }
    await appendLog('info', 'Geofencing stopped', { reason });
  } catch (error) {
    await appendLog('error', 'Failed to stop geofencing', {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type ReconcileOutcome =
  | 'nothing-to-do'
  | 'rearmed-missing-fence'
  | 'removed-orphan-fence';

/**
 * Brings the OS's registered fences back in line with our persisted state.
 *
 * This is the cheap defence against the single most likely "it didn't wake me up"
 * report. Android does NOT restore geofences across a device reboot, and drops them
 * on force-stop, with no callback either way — the app simply never hears from a
 * fence again. Re-registering on every foreground costs nothing and repairs both
 * cases, provided the user opens the app between the reboot and the journey.
 *
 * It is not a complete fix: a phone rebooted overnight and never opened before the
 * morning commute stays unarmed. Whether that gap needs a native BOOT_COMPLETED
 * receiver is a Phase 5 decision to be made from measurement, not assumption — and a
 * boot receiver has its own limits, since OEM autostart managers kill them anyway.
 */
export async function reconcileGeofence(): Promise<ReconcileOutcome> {
  const [state, registered] = await Promise.all([
    loadAlarmState(),
    Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => false),
  ]);

  const shouldBeArmed = state.status === 'armed';

  if (shouldBeArmed && !registered) {
    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [
      {
        identifier: GEOFENCE_REGION_ID,
        latitude: state.destination.latitude,
        longitude: state.destination.longitude,
        radius: state.destination.radius,
        notifyOnEnter: true,
        notifyOnExit: false,
      },
    ]);
    await appendLog('warn', 'Re-armed a fence the OS had dropped', {
      destination: state.destination.name,
      likelyCause: 'device reboot or force stop',
    });
    return 'rearmed-missing-fence';
  }

  if (!shouldBeArmed && registered) {
    await stopGeofencing('reconcile-orphan');
    await appendLog('warn', 'Removed a fence with no armed alarm behind it', {
      status: state.status,
    });
    return 'removed-orphan-fence';
  }

  return 'nothing-to-do';
}

/**
 * Runs reconciliation whenever the app comes to the foreground.
 * Returns an unsubscribe function.
 */
export function startGeofenceReconciliation(): () => void {
  const onChange = (next: AppStateStatus) => {
    if (next === 'active') {
      void reconcileGeofence();
    }
  };

  const subscription = AppState.addEventListener('change', onChange);
  // Also run once now: the app may have been launched cold after a reboot, which
  // never produces a background -> active transition.
  void reconcileGeofence();

  return () => subscription.remove();
}
