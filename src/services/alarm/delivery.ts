import { Vibration } from 'react-native';

import { setAlarmStarter } from './executeEffects';
import { startAlarmAudio, stopAlarmAudio } from '../alarmAudio';
import { appendLog } from '../debugLog';
import {
  clearArrivalNotifications,
  ensureAlarmChannels,
  presentArrivalNotification,
} from '../notifications';
import { loadSettings } from '../storage';
import type { Destination } from '../../types';

/** Matches the notification channel's pattern so the two do not fight each other. */
const VIBRATION_PATTERN = [0, 700, 300, 700, 300, 700];

/**
 * Sounds the alarm.
 *
 * Layered on purpose, weakest dependency first:
 *
 *  1. The notification, played by the SYSTEM on a MAX-importance channel. This is the
 *     wake-up. It works when our JS process is dead, which is the normal state of a
 *     phone that has been pocketed for twenty minutes.
 *  2. In-app looping audio and vibration, which only run if the process happens to be
 *     alive. They sustain the alarm; they never carry it.
 *
 * Getting this order wrong is the classic mistake: expo-audio from a headless task can
 * be denied audio focus outright, and there is no Activity to own the session.
 */
export async function deliverAlarm(destination: Destination): Promise<void> {
  const settings = await loadSettings();

  await ensureAlarmChannels();

  const notificationId = await presentArrivalNotification(destination, {
    sound: settings.soundEnabled,
    vibrate: settings.vibrationEnabled,
  });

  if (notificationId === null) {
    // The one failure that makes the whole app pointless, so it is recorded loudly.
    await appendLog('error', 'Arrival notification was not delivered', {
      destination: destination.name,
    });
  }

  if (settings.vibrationEnabled) {
    try {
      Vibration.vibrate(VIBRATION_PATTERN, true);
    } catch {
      // Some devices have no vibrator. Not worth failing over.
    }
  }

  if (settings.soundEnabled) {
    await startAlarmAudio(settings.maxAlarmDurationMs);
  }

  await appendLog('info', 'Alarm delivered', {
    destination: destination.name,
    sound: settings.soundEnabled,
    vibration: settings.vibrationEnabled,
    notificationDelivered: notificationId !== null,
  });
}

/** Silences everything the alarm started. Safe to call when nothing is ringing. */
export async function stopAlarmDelivery(reason = 'dismissed'): Promise<void> {
  try {
    Vibration.cancel();
  } catch {
    // Nothing to cancel.
  }
  await stopAlarmAudio(reason);
  await clearArrivalNotifications();
}

/**
 * Points the effect executor at real delivery.
 *
 * Called once from App.tsx. Until this runs, a `startAlarm` effect only writes a log —
 * which is what kept Phase 3 testable without any of this machinery existing.
 */
export function registerAlarmDelivery(): void {
  setAlarmStarter(deliverAlarm);
}
