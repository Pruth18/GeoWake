import type { AlarmEffect, Destination } from '../../types';
import { appendLog } from '../debugLog';
import { stopGeofencing } from '../geofence';
import { saveAlarmState } from '../storage';

export type AlarmStarter = (destination: Destination) => Promise<void>;

/**
 * Phase 4 replaces this with real delivery: a MAX-importance notification channel,
 * the alarm sound, vibration and the full-screen intent. Until then the decision and
 * state transition are complete and observable through the log, which is what the
 * Phase 3 gate needs.
 */
let startAlarmImpl: AlarmStarter = async (destination) => {
  await appendLog('warn', 'Arrival reached but alarm delivery is not wired yet', {
    destination: destination.name,
  });
};

export function setAlarmStarter(starter: AlarmStarter): void {
  startAlarmImpl = starter;
}

/**
 * Runs the effects a decision produced.
 *
 * Every effect is isolated: one failing must not prevent the others. The ordering the
 * decision function emits matters — state is persisted before the alarm starts, so a
 * process killed mid-delivery still comes back knowing the arrival was handled rather
 * than re-firing on the next event.
 */
export async function executeEffects(effects: AlarmEffect[]): Promise<void> {
  for (const effect of effects) {
    try {
      await executeOne(effect);
    } catch (error) {
      // Reported, never swallowed — but never allowed to abort the remaining effects.
      await appendLog('error', 'Effect failed', {
        effect: effect.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function executeOne(effect: AlarmEffect): Promise<void> {
  switch (effect.type) {
    case 'log':
      await appendLog(effect.level, effect.message, effect.data);
      return;

    case 'persistState':
      await saveAlarmState(effect.state);
      return;

    case 'startAlarm':
      await startAlarmImpl(effect.destination);
      return;

    case 'stopGeofencing':
      await stopGeofencing(effect.reason);
      return;
  }
}
