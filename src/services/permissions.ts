import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

export type PermissionSnapshot = {
  /** Ordinary "while using the app" location. */
  foreground: boolean;
  /** "Allow all the time". Without it the alarm cannot fire once the app is closed. */
  background: boolean;
  /** Android 13+ POST_NOTIFICATIONS. Without it the alarm notification is dropped. */
  notifications: boolean;
};

export type ArmBlocker = {
  permission: keyof PermissionSnapshot;
  title: string;
  message: string;
};

export async function checkPermissions(): Promise<PermissionSnapshot> {
  const [foreground, background, notifications] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
  ]);

  return {
    foreground: foreground.status === 'granted',
    background: background.status === 'granted',
    notifications: notifications.status === 'granted',
  };
}

/**
 * Requests everything the alarm needs, in the only order the platforms accept.
 *
 * Background location can only be requested once foreground is already granted —
 * asking cold is rejected outright on both platforms, and the user never even sees a
 * dialog. The MVP scattered ad-hoc requests across three screens with no ordering
 * guarantee, which is why background access frequently never got granted at all.
 */
export async function requestAlarmPermissions(): Promise<PermissionSnapshot> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { foreground: false, background: false, notifications: false };
  }

  // Requested before background so the user is not facing two location dialogs in a
  // row; the notification prompt is the cheaper "yes".
  const notifications = await Notifications.requestPermissionsAsync();
  const background = await Location.requestBackgroundPermissionsAsync();

  return {
    foreground: true,
    background: background.status === 'granted',
    notifications: notifications.status === 'granted',
  };
}

/**
 * Whether an alarm can be armed, and if not, what to tell the user.
 *
 * Pure so every branch is unit-testable.
 *
 * Notifications are a HARD blocker, not a warning. If POST_NOTIFICATIONS is denied on
 * Android 13+, the arrival notification is discarded by the system and the app is
 * never told — the alarm would appear armed and simply never fire. Refusing to arm is
 * the only honest behaviour available.
 */
export function blockersForArming(snapshot: PermissionSnapshot): ArmBlocker[] {
  const blockers: ArmBlocker[] = [];

  if (!snapshot.foreground) {
    blockers.push({
      permission: 'foreground',
      title: 'Location access needed',
      message: 'GeoWake needs your location to know when you have arrived.',
    });
  }

  if (!snapshot.notifications) {
    blockers.push({
      permission: 'notifications',
      title: 'Notifications needed',
      message:
        'Android silently discards the arrival alarm if notifications are off, so the alarm would never reach you. Enable notifications for GeoWake to continue.',
    });
  }

  if (!snapshot.background) {
    blockers.push({
      permission: 'background',
      title: 'Background location needed',
      message:
        'Set location access to "Allow all the time". Without it the alarm can only fire while GeoWake is open on screen — which defeats the point of it.',
    });
  }

  return blockers;
}

export function canArm(snapshot: PermissionSnapshot): boolean {
  return blockersForArming(snapshot).length === 0;
}
