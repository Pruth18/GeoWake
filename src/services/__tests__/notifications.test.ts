import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-1'),
  getPresentedNotificationsAsync: jest.fn().mockResolvedValue([]),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  AndroidImportance: { MAX: 7, HIGH: 6, DEFAULT: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: 'max' },
}));

jest.mock('react-native', () => ({ Platform: { OS: 'android', select: (o: never) => o } }));

import * as Notifications from 'expo-notifications';

import {
  ALARM_CHANNEL_ID,
  ALARM_CHANNEL_SILENT_ID,
  ARRIVAL_NOTIFICATION_TAG,
  canDeliverNotifications,
  clearArrivalNotifications,
  configureNotificationHandler,
  ensureAlarmChannels,
  presentArrivalNotification,
} from '../notifications';
import { readLog } from '../debugLog';
import type { Destination } from '../../types';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

const destination: Destination = {
  id: 'd1',
  name: 'Kings Cross',
  latitude: 51.5308,
  longitude: -0.1238,
  radius: 500,
  createdAt: 1_700_000_000_000,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mocked.setNotificationChannelAsync.mockResolvedValue(undefined as never);
  mocked.scheduleNotificationAsync.mockResolvedValue('notif-1');
  mocked.getPresentedNotificationsAsync.mockResolvedValue([] as never);
});

describe('configureNotificationHandler', () => {
  it('keeps shouldPlaySound true', async () => {
    configureNotificationHandler();

    const handler = mocked.setNotificationHandler.mock.calls[0]?.[0];
    const behaviour = await handler?.handleNotification?.({} as never);

    // Not a preference. Expo's docs state that on Android, shouldPlaySound: false
    // suppresses the heads-up alert entirely "no matter what the priority is" — a
    // silent alarm that also never appears is the worst of both.
    expect(behaviour).toMatchObject({ shouldPlaySound: true, shouldShowBanner: true });
  });
});

describe('ensureAlarmChannels', () => {
  it('creates both the audible and silent channels', async () => {
    await ensureAlarmChannels();

    const ids = mocked.setNotificationChannelAsync.mock.calls.map((c) => c[0]);
    // Two channels exist because a channel's sound is immutable after creation, so
    // the Sound setting has to select between them rather than edit one.
    expect(ids).toEqual([ALARM_CHANNEL_ID, ALARM_CHANNEL_SILENT_ID]);
  });

  it('uses MAX importance and bypasses Do Not Disturb', async () => {
    await ensureAlarmChannels();

    const [, config] = mocked.setNotificationChannelAsync.mock.calls[0] ?? [];
    expect(config).toMatchObject({
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  });

  it('gives the audible channel a sound and the silent one none', async () => {
    await ensureAlarmChannels();

    const [audible, silent] = mocked.setNotificationChannelAsync.mock.calls;
    expect(audible?.[1]).toMatchObject({ sound: 'alarm.wav' });
    expect(silent?.[1]).toMatchObject({ sound: null });
  });

  it('references the sound by bare filename', async () => {
    await ensureAlarmChannels();
    const [, config] = mocked.setNotificationChannelAsync.mock.calls[0] ?? [];
    // res/raw does not resolve paths — "./assets/sounds/alarm.wav" would silently
    // produce a channel with no sound.
    expect((config as { sound?: string })?.sound).not.toContain('/');
  });

  it('reports a channel failure rather than throwing', async () => {
    mocked.setNotificationChannelAsync.mockRejectedValue(new Error('native failure'));

    await expect(ensureAlarmChannels()).resolves.toBeUndefined();

    const entries = await readLog();
    expect(entries.some((e) => e.level === 'error')).toBe(true);
  });
});

describe('presentArrivalNotification', () => {
  it('posts to the audible channel by default', async () => {
    await presentArrivalNotification(destination);

    const [request] = mocked.scheduleNotificationAsync.mock.calls[0] ?? [];
    expect(request?.trigger).toMatchObject({ channelId: ALARM_CHANNEL_ID });
  });

  it('posts to the silent channel when sound is off', async () => {
    await presentArrivalNotification(destination, { sound: false, vibrate: true });

    const [request] = mocked.scheduleNotificationAsync.mock.calls[0] ?? [];
    expect(request?.trigger).toMatchObject({ channelId: ALARM_CHANNEL_SILENT_ID });
  });

  it('names the destination so the notification is actionable from the lock screen', async () => {
    await presentArrivalNotification(destination);

    const [request] = mocked.scheduleNotificationAsync.mock.calls[0] ?? [];
    expect(request?.content.title).toContain('Kings Cross');
  });

  it('is sticky and does not auto-dismiss', async () => {
    await presentArrivalNotification(destination);

    const [request] = mocked.scheduleNotificationAsync.mock.calls[0] ?? [];
    // An alarm that quietly clears itself is not an alarm.
    expect(request?.content).toMatchObject({ sticky: true, autoDismiss: false });
  });

  it('tags the notification so it can be cleared later', async () => {
    await presentArrivalNotification(destination);

    const [request] = mocked.scheduleNotificationAsync.mock.calls[0] ?? [];
    expect(request?.content.data).toMatchObject({ tag: ARRIVAL_NOTIFICATION_TAG });
  });

  it('returns null and records the failure rather than throwing', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValue(new Error('channel missing'));

    await expect(presentArrivalNotification(destination)).resolves.toBeNull();

    const entries = await readLog();
    expect(entries.some((e) => e.level === 'error')).toBe(true);
  });
});

describe('clearArrivalNotifications', () => {
  it('dismisses only our own notifications', async () => {
    mocked.getPresentedNotificationsAsync.mockResolvedValue([
      { request: { identifier: 'ours', content: { data: { tag: ARRIVAL_NOTIFICATION_TAG } } } },
      { request: { identifier: 'someone-elses', content: { data: {} } } },
    ] as never);

    await clearArrivalNotifications();

    expect(mocked.dismissNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocked.dismissNotificationAsync).toHaveBeenCalledWith('ours');
  });

  it('does not throw when the query fails', async () => {
    mocked.getPresentedNotificationsAsync.mockRejectedValue(new Error('nope'));
    await expect(clearArrivalNotifications()).resolves.toBeUndefined();
  });
});

describe('canDeliverNotifications', () => {
  it('reflects the permission', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    await expect(canDeliverNotifications()).resolves.toBe(true);

    mocked.getPermissionsAsync.mockResolvedValue({ granted: false } as never);
    await expect(canDeliverNotifications()).resolves.toBe(false);
  });

  it('assumes undeliverable when the check itself fails', async () => {
    mocked.getPermissionsAsync.mockRejectedValue(new Error('nope'));
    // Failing closed is right here: reporting "deliverable" when we cannot tell would
    // let the app arm an alarm that never reaches the user.
    await expect(canDeliverNotifications()).resolves.toBe(false);
  });
});
