import AsyncStorage from '@react-native-async-storage/async-storage';
import { Vibration } from 'react-native';

jest.mock('../../notifications', () => ({
  ensureAlarmChannels: jest.fn().mockResolvedValue(undefined),
  presentArrivalNotification: jest.fn().mockResolvedValue('notif-1'),
  clearArrivalNotifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../alarmAudio', () => ({
  startAlarmAudio: jest.fn().mockResolvedValue(undefined),
  stopAlarmAudio: jest.fn().mockResolvedValue(undefined),
}));

import { deliverAlarm, stopAlarmDelivery } from '../delivery';
import { readLog } from '../../debugLog';
import { saveSettings } from '../../storage';
import { DEFAULT_SETTINGS, type Destination } from '../../../types';

const notifications = jest.requireMock('../../notifications') as {
  ensureAlarmChannels: jest.Mock;
  presentArrivalNotification: jest.Mock;
  clearArrivalNotifications: jest.Mock;
};
const audio = jest.requireMock('../../alarmAudio') as {
  startAlarmAudio: jest.Mock;
  stopAlarmAudio: jest.Mock;
};

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
  notifications.presentArrivalNotification.mockResolvedValue('notif-1');
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  jest.spyOn(Vibration, 'cancel').mockImplementation(() => {});
});

describe('deliverAlarm', () => {
  it('creates the channels before presenting', async () => {
    await deliverAlarm(destination);
    // A notification posted to a channel that does not exist yet loses its MAX
    // importance and its sound.
    expect(notifications.ensureAlarmChannels).toHaveBeenCalled();
    expect(notifications.presentArrivalNotification).toHaveBeenCalled();
  });

  it('presents the notification — the primary wake-up — regardless of settings', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, soundEnabled: false, vibrationEnabled: false });
    await deliverAlarm(destination);

    // The system-played notification is what works when our process is dead. It is
    // never skipped; the settings only change how it sounds.
    expect(notifications.presentArrivalNotification).toHaveBeenCalledTimes(1);
  });

  it('honours the sound setting', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, soundEnabled: false });
    await deliverAlarm(destination);

    expect(notifications.presentArrivalNotification).toHaveBeenCalledWith(
      destination,
      expect.objectContaining({ sound: false })
    );
    expect(audio.startAlarmAudio).not.toHaveBeenCalled();
  });

  it('honours the vibration setting', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, vibrationEnabled: false });
    await deliverAlarm(destination);

    expect(notifications.presentArrivalNotification).toHaveBeenCalledWith(
      destination,
      expect.objectContaining({ vibrate: false })
    );
    expect(Vibration.vibrate).not.toHaveBeenCalled();
  });

  it('starts sustained audio with the configured max duration', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, maxAlarmDurationMs: 60_000 });
    await deliverAlarm(destination);
    expect(audio.startAlarmAudio).toHaveBeenCalledWith(60_000);
  });

  it('records loudly when the notification was not delivered', async () => {
    notifications.presentArrivalNotification.mockResolvedValue(null);

    await deliverAlarm(destination);

    // This is the one failure that makes the whole app pointless.
    const entries = await readLog();
    const failure = entries.find((e) => e.message === 'Arrival notification was not delivered');
    expect(failure?.level).toBe('error');
  });

  it('still sustains audio when the notification failed', async () => {
    notifications.presentArrivalNotification.mockResolvedValue(null);
    await deliverAlarm(destination);
    // Degraded, but a noise the user might hear beats silence.
    expect(audio.startAlarmAudio).toHaveBeenCalled();
  });

  it('does not throw when vibration is unavailable', async () => {
    (Vibration.vibrate as jest.Mock).mockImplementation(() => {
      throw new Error('no vibrator');
    });
    await expect(deliverAlarm(destination)).resolves.toBeUndefined();
  });
});

describe('stopAlarmDelivery', () => {
  it('silences vibration, audio and the notification', async () => {
    await stopAlarmDelivery('user-dismissed');

    expect(Vibration.cancel).toHaveBeenCalled();
    expect(audio.stopAlarmAudio).toHaveBeenCalledWith('user-dismissed');
    expect(notifications.clearArrivalNotifications).toHaveBeenCalled();
  });

  it('is safe to call when nothing is ringing', async () => {
    await expect(stopAlarmDelivery()).resolves.toBeUndefined();
  });
});
