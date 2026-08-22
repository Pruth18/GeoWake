import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { appendLog } from './debugLog';
import type { Destination } from '../types';

/**
 * Versioned deliberately.
 *
 * Android notification channels are IMMUTABLE after first creation. Changing the
 * sound, importance or DND behaviour on an existing id silently does nothing — the
 * settings the user first received are the ones they keep forever. Any change to the
 * channel below requires bumping this to -v2, which creates a fresh channel.
 */
export const ALARM_CHANNEL_ID = 'geowake-alarm-v1';

/**
 * A second channel with no sound.
 *
 * A channel's sound cannot be changed after creation, so "Sound" in Settings cannot be
 * honoured by editing one channel — it has to select between two. The alternative was
 * to let the setting quietly do nothing, which is what the MVP did.
 */
export const ALARM_CHANNEL_SILENT_ID = 'geowake-alarm-silent-v1';

/** Bundled into res/raw by the expo-notifications plugin; referenced by bare filename. */
const ALARM_SOUND = 'alarm.wav';

const VIBRATION_PATTERN = [0, 700, 300, 700, 300, 700];

/** Marks our arrival notification so it can be found and cleared later. */
export const ARRIVAL_NOTIFICATION_TAG = 'geowake-arrival';

/**
 * Must run before any notification is presented.
 *
 * The `shouldPlaySound: true` is load-bearing on Android, not a preference: expo's own
 * docs state that setting it false suppresses the heads-up alert entirely, "no matter
 * what the priority is". A silent alarm that also never appears is the worst of both.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureAlarmChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const base = {
    description: 'Wakes you when you reach your destination.',
    importance: Notifications.AndroidImportance.MAX,
    // Long, insistent pattern. This is an alarm, not a nudge.
    vibrationPattern: VIBRATION_PATTERN,
    enableVibrate: true,
    // Requires the user to grant DND access; harmless when they have not.
    bypassDnd: true,
    // The destination name is not sensitive, and hiding it on the lock screen would
    // make the alarm harder to act on at exactly the wrong moment.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
  } as const;

  try {
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
      ...base,
      name: 'Arrival alarms',
      sound: ALARM_SOUND,
    });
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_SILENT_ID, {
      ...base,
      name: 'Arrival alarms (vibrate only)',
      sound: null,
    });
  } catch (error) {
    await appendLog('error', 'Failed to create the alarm notification channels', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Presents the arrival notification.
 *
 * This — not expo-audio — is the primary wake-up. The system plays the channel sound,
 * so it works even when our JS process is not alive to play anything, which is the
 * normal case for a phone that has been in a pocket for twenty minutes. In-app audio
 * only sustains the alarm once the Activity is actually up.
 */
export async function presentArrivalNotification(
  destination: Destination,
  options: { sound: boolean; vibrate: boolean } = { sound: true, vibrate: true }
): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: `You've arrived at ${destination.name}`,
        body: 'Tap to stop the alarm.',
        sound: options.sound ? ALARM_SOUND : false,
        priority: Notifications.AndroidNotificationPriority.MAX,
        // Survives being swiped at from the lock screen; cleared explicitly on dismiss.
        sticky: true,
        autoDismiss: false,
        vibrate: options.vibrate ? VIBRATION_PATTERN : [],
        data: { tag: ARRIVAL_NOTIFICATION_TAG, destinationId: destination.id },
      },
      // ChannelAwareTriggerInput: delivered immediately, on the chosen channel. A
      // plain `null` trigger is also immediate but carries no channel, which on
      // Android would fall back to the default channel and lose MAX importance.
      trigger: { channelId: options.sound ? ALARM_CHANNEL_ID : ALARM_CHANNEL_SILENT_ID },
    });
  } catch (error) {
    await appendLog('error', 'Failed to present the arrival notification', {
      destination: destination.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function clearArrivalNotifications(): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => n.request.content.data?.tag === ARRIVAL_NOTIFICATION_TAG)
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier))
    );
  } catch (error) {
    await appendLog('warn', 'Failed to clear arrival notifications', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Whether the OS will actually deliver our notifications.
 *
 * Worth checking separately from the permission prompt: a user can revoke this in
 * system settings long after granting it, and Android gives the app no callback. An
 * armed alarm whose notification is being dropped is indistinguishable from a working
 * one until the moment it fails.
 */
export async function canDeliverNotifications(): Promise<boolean> {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}
