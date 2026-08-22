import * as Location from 'expo-location';
import { AppState, type AppStateStatus } from 'react-native';

import { GEOFENCE_TASK_NAME } from '../tasks/constants';
import { GEOFENCE_REGION_ID, IDLE_STATE, type Destination } from '../types';
import { appendLog } from './debugLog';
import { readAlarmState, saveAlarmState } from './storage';

function regionFor(destination: Destination) {
  return {
    identifier: GEOFENCE_REGION_ID,
    latitude: destination.latitude,
    longitude: destination.longitude,
    radius: destination.radius,
    notifyOnEnter: true,
    // We only care about arrival. Asking for exits doubles the events the OS wakes us
    // for, and every wake-up costs battery on a device in someone's pocket.
    notifyOnExit: false,
  };
}

/**
 * Arms exactly one alarm, replacing whatever was armed before.
 *
 * startGeofencingAsync replaces the entire region set for the task, so there is no way
 * to accumulate stale regions through this path — which is what makes the single-alarm
 * constraint enforceable rather than merely intended.
 *
 * Throws if the alarm could not be armed. Callers must surface that: an alarm that
 * silently failed to arm is worse than one that visibly did.
 */
export async function armAlarm(destination: Destination): Promise<void> {
  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [regionFor(destination)]);

  const persisted = await saveAlarmState({ status: 'armed', destination, armedAt: Date.now() });

  /**
   * Arming spans two systems — the OS fence and our persisted state — with no
   * transaction across them. If the write failed we would leave the OS watching a
   * region while our state says otherwise, and on arrival the handler would read stale
   * state and either ignore the event or tear the fence down. Both are silent misses.
   *
   * So roll the fence back and fail loudly. A user told "that didn't work, try again"
   * is far better off than one told nothing and left with an alarm that will not fire.
   */
  if (!persisted) {
    await stopGeofencing('arm-rollback');
    await appendLog('error', 'Arming failed: state did not persist, fence rolled back', {
      destination: destination.name,
    });
    throw new Error('Could not save the alarm. Please try again.');
  }

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
 * and acknowledged it, which is what the arrival log needs to show during dogfooding.
 * It also makes a repeat arrival a provable no-op rather than relying on the fence
 * already being gone.
 */
export async function dismissAlarm(): Promise<void> {
  const { state, ok } = await readAlarmState();

  if (!ok) {
    await appendLog('error', 'Dismiss requested but alarm state was unreadable');
    return;
  }

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

/** Removes every region for the task. Safe to call when nothing is registered. */
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
  | 'removed-orphan-fence'
  | 'rearm-failed'
  | 'unknown-registration';

/**
 * Brings the OS's registered fences back in line with our persisted state.
 *
 * This is the cheap defence against the single most likely "it didn't wake me up"
 * report. Android does NOT restore geofences across a device reboot, and drops them on
 * force-stop, with no callback either way — the app simply never hears from a fence
 * again. Re-registering on every foreground costs nothing and repairs both cases,
 * provided the user opens the app between the reboot and the journey.
 *
 * It is not a complete fix: a phone rebooted overnight and never opened before the
 * morning commute stays unarmed. Whether that gap needs a native BOOT_COMPLETED
 * receiver is a decision to make from measurement, not assumption — and a boot receiver
 * has its own limits, since OEM autostart managers kill them anyway.
 */
export async function reconcileGeofence(): Promise<ReconcileOutcome> {
  const { state, ok: stateOk } = await readAlarmState();

  // An unreadable state must not drive a decision. Reconcile can both register and
  // deregister fences, and doing either on a guess is worse than doing nothing.
  if (!stateOk) {
    await appendLog('error', 'Reconcile skipped: alarm state was unreadable');
    return 'unknown-registration';
  }

  let registered: boolean;
  try {
    registered = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
  } catch (error) {
    // Previously coerced to `false`, which silently claimed "no fence registered" —
    // making reconcile either re-register on every foreground or leave an orphan in
    // place, with nothing recorded either way.
    await appendLog('warn', 'Could not determine whether geofencing is active', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'unknown-registration';
  }

  const shouldBeArmed = state.status === 'armed';

  if (shouldBeArmed && !registered) {
    try {
      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [regionFor(state.destination)]);
    } catch (error) {
      /**
       * This is the reboot-recovery path, and it fails for real reasons: background
       * location revoked since arming, Play Services updating, geofence limits reached.
       * It was previously an unhandled rejection behind a bare `void`, so the re-arm
       * failed, nothing was logged, and persisted state still claimed `armed` — app and
       * user both believing in an alarm that no longer existed.
       */
      await appendLog('error', 'Failed to re-arm a dropped fence; the alarm is NOT active', {
        destination: state.destination.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'rearm-failed';
    }

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
  const runReconcile = () => {
    // Never a bare `void`: an unhandled rejection here vanishes, and this is the path
    // that repairs a fence lost to a reboot.
    reconcileGeofence().catch((error: unknown) => {
      void appendLog('error', 'Reconcile threw', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const onChange = (next: AppStateStatus) => {
    if (next === 'active') runReconcile();
  };

  const subscription = AppState.addEventListener('change', onChange);
  // Also run once now: the app may have been launched cold after a reboot, which never
  // produces a background -> active transition.
  runReconcile();

  return () => subscription.remove();
}
