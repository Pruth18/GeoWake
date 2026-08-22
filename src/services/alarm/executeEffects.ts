import type { AlarmEffect, Destination } from '../../types';
import { appendLog } from '../debugLog';
import { stopGeofencing } from '../geofence';
import { saveAlarmState } from '../storage';

export type AlarmStarter = (destination: Destination) => Promise<void>;

/**
 * Deliberately throws.
 *
 * Real delivery is installed by registerAlarmDelivery() at module scope in index.ts.
 * If this placeholder is ever reached, the wiring is broken and the alarm is silent —
 * so it must surface as an ERROR through executeEffects' reporting, not as a warning
 * that reads like an unfinished TODO.
 *
 * An earlier version logged a warning here instead. That made a completely silent
 * alarm indistinguishable from a healthy one in the event log, because the state
 * transition and "Arrival detected" were still written normally.
 */
let startAlarmImpl: AlarmStarter = async (destination) => {
  throw new Error(
    `Alarm delivery is not registered — registerAlarmDelivery() did not run. ` +
      `Arrival at "${destination.name}" produced no sound.`
  );
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
