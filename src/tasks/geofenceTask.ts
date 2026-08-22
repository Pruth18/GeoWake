import * as TaskManager from 'expo-task-manager';

import { handleGeofenceEvent } from '../services/alarm/handleGeofenceEvent';
import { executeEffects } from '../services/alarm/executeEffects';
import { appendLog } from '../services/debugLog';
import { readAlarmState } from '../services/storage';
import { GEOFENCE_TASK_NAME } from './constants';

/**
 * Registers the geofence task. Imported for its side effect from index.ts.
 *
 * defineTask runs at module scope on purpose, and this file must never be imported
 * from anywhere else. When a fence fires with the app closed, Android boots the JS
 * bundle and immediately looks for a task registered under this name — with no React
 * tree, no mounted views and no navigation. Anything registered inside a hook or
 * component would not have run yet, and the alarm would silently fail in exactly the
 * situation the app exists for.
 *
 * The body is kept deliberately thin. It reads state, delegates the entire decision
 * to a pure function, and executes what comes back. Nothing here is testable on a
 * developer machine, so there is as little here as possible.
 */
TaskManager.defineTask(GEOFENCE_TASK_NAME, async (payload) => {
  try {
    const { state, ok } = await readAlarmState();
    const effects = handleGeofenceEvent({ payload, state, now: Date.now(), stateReadOk: ok });
    await executeEffects(effects);
  } catch (error) {
    // The last line of defence. An exception escaping here is invisible: there is no
    // UI, and the process is gone moments later. Recording it is the only way the
    // failure is ever seen again.
    await appendLog('error', 'Geofence task threw', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export { GEOFENCE_TASK_NAME };
