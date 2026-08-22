import { readFileSync } from 'fs';

import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../geofence', () => ({
  stopGeofencing: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../notifications', () => ({
  ensureAlarmChannels: jest.fn().mockResolvedValue(undefined),
  presentArrivalNotification: jest.fn().mockResolvedValue('notif-1'),
  clearArrivalNotifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../alarmAudio', () => ({
  startAlarmAudio: jest.fn().mockResolvedValue(undefined),
  stopAlarmAudio: jest.fn().mockResolvedValue(undefined),
}));

import { executeEffects, setAlarmStarter } from '../executeEffects';
import { registerAlarmDelivery } from '../delivery';
import { readLog } from '../../debugLog';
import type { Destination } from '../../../types';

const notifications = jest.requireMock('../../notifications') as {
  presentArrivalNotification: jest.Mock;
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
});

afterEach(() => {
  setAlarmStarter(async () => {});
});

/**
 * Regression tests for a bug that made the alarm completely silent on every real
 * commute while looking perfectly healthy in every other signal.
 *
 * registerAlarmDelivery() used to be called from an App-level useEffect. When a
 * geofence fires with the app closed, Android runs index.ts and looks for the
 * registered task — it never mounts React, so that effect never ran and the effect
 * executor kept its placeholder starter.
 *
 * Nothing caught it: the state transition still happened, "Arrival detected" was still
 * logged, the Maestro flow still passed (it runs in the foreground, where App IS
 * mounted), and every unit test installed its own starter via setAlarmStarter.
 */
describe('alarm delivery wiring', () => {
  it('an unregistered starter fails loudly rather than logging a warning', async () => {
    // Reinstates the throwing default. Deliberately not via jest.resetModules(): that
    // would hand the fresh copy a different AsyncStorage instance from the one readLog
    // reads, and the assertion would pass or fail for the wrong reason.
    setAlarmStarter(async (d) => {
      throw new Error(`Alarm delivery is not registered. Arrival at "${d.name}" made no sound.`);
    });

    await executeEffects([{ type: 'startAlarm', destination }]);

    const entries = await readLog();
    const failure = entries.find((e) => e.message === 'Effect failed');
    // Must be an error. The placeholder previously wrote a `warn` that read like an
    // unfinished TODO, making a silent alarm indistinguishable from a healthy one.
    expect(failure?.level).toBe('error');
    expect(String(failure?.data?.error)).toMatch(/not registered/i);
  });

  it('registerAlarmDelivery installs a starter that actually delivers', async () => {
    registerAlarmDelivery();

    await executeEffects([{ type: 'startAlarm', destination }]);

    expect(notifications.presentArrivalNotification).toHaveBeenCalledWith(
      destination,
      expect.anything()
    );
  });

  /**
   * A structural invariant rather than a runtime one.
   *
   * Importing index.ts for real would pull in the whole native surface, and mocking all
   * of it would test the mocks rather than the wiring. What needs guarding is
   * structural: these calls must sit at module scope in the entry point, because that
   * is the only code a headless wake-up runs. A call indented inside a function body
   * is, by definition, not at module scope.
   */
  it('the entry point calls the wiring at module scope', () => {
    const lines = readFileSync('index.ts', 'utf8').split(/\r?\n/);

    for (const call of [
      'registerAlarmDelivery();',
      'initMonitoring();',
      'configureNotificationHandler();',
    ]) {
      // Unindented === top level.
      expect(lines).toContain(call);
    }
  });

  it('App.tsx does not own alarm-critical initialisation', () => {
    const source = readFileSync('src/App.tsx', 'utf8');

    // React never mounts App on the headless path, so anything the alarm needs must not
    // live here — it would work in every foreground test and never on a real commute.
    expect(source).not.toContain('registerAlarmDelivery');
    expect(source).not.toContain('initMonitoring');
  });
});
