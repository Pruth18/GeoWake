// Mocked rather than imported for real: expo-notifications logs an Expo Go warning at
// import time, and neither module can run outside a native runtime.
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

import {
  blockersForArming,
  canArm,
  checkPermissions,
  requestAlarmPermissions,
  type PermissionSnapshot,
} from '../permissions';

const location = Location as jest.Mocked<typeof Location>;
const notifications = Notifications as jest.Mocked<typeof Notifications>;

const granted = { status: 'granted' } as never;
const denied = { status: 'denied' } as never;

beforeEach(() => {
  jest.clearAllMocks();
});

const all = (value: boolean): PermissionSnapshot => ({
  foreground: value,
  background: value,
  notifications: value,
});

describe('blockersForArming', () => {
  it('allows arming when everything is granted', () => {
    expect(blockersForArming(all(true))).toEqual([]);
    expect(canArm(all(true))).toBe(true);
  });

  it('blocks when foreground location is missing', () => {
    const blockers = blockersForArming({ ...all(true), foreground: false });
    expect(blockers.map((b) => b.permission)).toContain('foreground');
  });

  /**
   * Notifications are a hard blocker, not a warning.
   *
   * If POST_NOTIFICATIONS is denied on Android 13+, the system discards the arrival
   * notification and never tells the app. The alarm would show as armed and simply
   * never reach the user — the single worst failure this app can have. Refusing to
   * arm is the only honest option.
   */
  it('blocks when notifications are denied', () => {
    const blockers = blockersForArming({ ...all(true), notifications: false });
    expect(blockers.map((b) => b.permission)).toContain('notifications');
    expect(canArm({ ...all(true), notifications: false })).toBe(false);
  });

  it('blocks when background location is missing', () => {
    const blockers = blockersForArming({ ...all(true), background: false });
    expect(blockers.map((b) => b.permission)).toContain('background');
    expect(canArm({ ...all(true), background: false })).toBe(false);
  });

  it('reports every missing permission, not just the first', () => {
    // The user should be able to see everything they need to fix in one pass rather
    // than discovering them one dialog at a time.
    expect(blockersForArming(all(false))).toHaveLength(3);
  });

  it('gives every blocker a title and a message that explains the consequence', () => {
    for (const blocker of blockersForArming(all(false))) {
      expect(blocker.title.length).toBeGreaterThan(0);
      expect(blocker.message.length).toBeGreaterThan(20);
    }
  });

  it('lists foreground before background', () => {
    // Background can only be requested once foreground is granted, so presenting them
    // in the other order would ask for something the platform will refuse.
    const order = blockersForArming(all(false)).map((b) => b.permission);
    expect(order.indexOf('foreground')).toBeLessThan(order.indexOf('background'));
  });
});

describe('checkPermissions', () => {
  it('reports each permission independently', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue(granted);
    location.getBackgroundPermissionsAsync.mockResolvedValue(denied);
    notifications.getPermissionsAsync.mockResolvedValue(granted);

    await expect(checkPermissions()).resolves.toEqual({
      foreground: true,
      background: false,
      notifications: true,
    });
  });
});

describe('requestAlarmPermissions', () => {
  /**
   * Ordering is not cosmetic. Background location can only be requested once
   * foreground is already granted — asking cold is rejected outright and the user
   * never sees a dialog at all. The MVP made ad-hoc requests from three screens with
   * no ordering guarantee, which is why background access often never got granted.
   */
  it('requests foreground before background', async () => {
    const order: string[] = [];
    location.requestForegroundPermissionsAsync.mockImplementation(async () => {
      order.push('foreground');
      return granted;
    });
    notifications.requestPermissionsAsync.mockImplementation(async () => {
      order.push('notifications');
      return granted;
    });
    location.requestBackgroundPermissionsAsync.mockImplementation(async () => {
      order.push('background');
      return granted;
    });

    await requestAlarmPermissions();

    expect(order.indexOf('foreground')).toBeLessThan(order.indexOf('background'));
  });

  it('does not ask for background when foreground was refused', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue(denied);

    const result = await requestAlarmPermissions();

    // The platform would reject it anyway; asking burns the user's one-shot prompt.
    expect(location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    expect(result).toEqual({ foreground: false, background: false, notifications: false });
  });

  it('reports partial grants accurately', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue(granted);
    notifications.requestPermissionsAsync.mockResolvedValue(granted);
    location.requestBackgroundPermissionsAsync.mockResolvedValue(denied);

    await expect(requestAlarmPermissions()).resolves.toEqual({
      foreground: true,
      background: false,
      notifications: true,
    });
  });

  it('produces a snapshot that blocks arming when background is refused', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue(granted);
    notifications.requestPermissionsAsync.mockResolvedValue(granted);
    location.requestBackgroundPermissionsAsync.mockResolvedValue(denied);

    expect(canArm(await requestAlarmPermissions())).toBe(false);
  });
});
