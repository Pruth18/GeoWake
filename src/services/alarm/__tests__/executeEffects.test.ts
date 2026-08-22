import AsyncStorage from '@react-native-async-storage/async-storage';

import { executeEffects, setAlarmStarter } from '../executeEffects';
import { readLog } from '../../debugLog';
import { loadAlarmState } from '../../storage';
import type { AlarmEffect, AlarmState, Destination } from '../../../types';

// Only the native-touching module is mocked. storage and debugLog run for real
// against the in-memory AsyncStorage mock, so the assertions cover what actually
// lands on disk rather than what a spy was called with.
jest.mock('../../geofence', () => ({
  stopGeofencing: jest.fn().mockResolvedValue(undefined),
}));

const { stopGeofencing } = jest.requireMock('../../geofence') as {
  stopGeofencing: jest.Mock;
};

const destination: Destination = {
  id: 'd1',
  name: 'Kings Cross',
  latitude: 51.5308,
  longitude: -0.1238,
  radius: 500,
  createdAt: 1_700_000_000_000,
};

const triggeredState: AlarmState = {
  status: 'triggered',
  destination,
  armedAt: 1_700_000_000_000,
  triggeredAt: 1_700_000_100_000,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  setAlarmStarter(async () => {});
});

describe('executeEffects', () => {
  it('persists state', async () => {
    await executeEffects([{ type: 'persistState', state: triggeredState }]);
    await expect(loadAlarmState()).resolves.toEqual(triggeredState);
  });

  it('writes log effects to the persisted log', async () => {
    await executeEffects([
      { type: 'log', level: 'info', message: 'Arrival detected', data: { destination: 'X' } },
    ]);

    const entries = await readLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'info', message: 'Arrival detected' });
  });

  it('calls the registered alarm starter with the destination', async () => {
    const started: Destination[] = [];
    setAlarmStarter(async (d) => {
      started.push(d);
    });

    await executeEffects([{ type: 'startAlarm', destination }]);
    expect(started).toEqual([destination]);
  });

  it('stops geofencing with the reason', async () => {
    await executeEffects([{ type: 'stopGeofencing', reason: 'arrived' }]);
    expect(stopGeofencing).toHaveBeenCalledWith('arrived');
  });

  it('runs a full arrival sequence in order', async () => {
    const order: string[] = [];
    setAlarmStarter(async () => {
      order.push('startAlarm');
    });
    stopGeofencing.mockImplementation(async () => {
      order.push('stopGeofencing');
    });

    const effects: AlarmEffect[] = [
      { type: 'log', level: 'info', message: 'Arrival detected' },
      { type: 'persistState', state: triggeredState },
      { type: 'startAlarm', destination },
      { type: 'stopGeofencing', reason: 'arrived' },
    ];
    await executeEffects(effects);

    expect(order).toEqual(['startAlarm', 'stopGeofencing']);
    // State is persisted before the alarm starts, so a process killed mid-delivery
    // comes back knowing the arrival was handled instead of re-firing.
    await expect(loadAlarmState()).resolves.toEqual(triggeredState);
  });
});

describe('failure isolation', () => {
  it('continues after an effect throws', async () => {
    setAlarmStarter(async () => {
      throw new Error('notification channel missing');
    });

    await executeEffects([
      { type: 'startAlarm', destination },
      { type: 'persistState', state: triggeredState },
    ]);

    // The alarm failing to sound must not also lose the state transition — otherwise
    // the next geofence event would re-trigger an alarm the user already dealt with.
    await expect(loadAlarmState()).resolves.toEqual(triggeredState);
  });

  it('records the failure rather than swallowing it', async () => {
    setAlarmStarter(async () => {
      throw new Error('notification channel missing');
    });

    await executeEffects([{ type: 'startAlarm', destination }]);

    const entries = await readLog();
    const failure = entries.find((e) => e.message === 'Effect failed');
    expect(failure?.level).toBe('error');
    expect(failure?.data).toMatchObject({ effect: 'startAlarm' });
  });

  it('does not throw out of executeEffects', async () => {
    setAlarmStarter(async () => {
      throw new Error('boom');
    });
    await expect(
      executeEffects([{ type: 'startAlarm', destination }])
    ).resolves.toBeUndefined();
  });

  it('handles an empty effect list', async () => {
    await expect(executeEffects([])).resolves.toBeUndefined();
  });
});
