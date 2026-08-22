import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-location', () => ({
  startGeofencingAsync: jest.fn().mockResolvedValue(undefined),
  stopGeofencingAsync: jest.fn().mockResolvedValue(undefined),
  hasStartedGeofencingAsync: jest.fn().mockResolvedValue(false),
}));

import * as Location from 'expo-location';
import { AppState } from 'react-native';

import {
  armAlarm,
  startGeofenceReconciliation,
  disarmAlarm,
  dismissAlarm,
  reconcileGeofence,
  stopGeofencing,
} from '../geofence';
import { readLog } from '../debugLog';
import { loadAlarmState, saveAlarmState } from '../storage';
import { GEOFENCE_REGION_ID, type Destination } from '../../types';
import { GEOFENCE_TASK_NAME } from '../../tasks/constants';

const mocked = Location as jest.Mocked<typeof Location>;

const removeListener = jest.fn();
jest.spyOn(AppState, 'addEventListener').mockImplementation(
  () => ({ remove: removeListener }) as never
);

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
  mocked.hasStartedGeofencingAsync.mockResolvedValue(false);
  mocked.startGeofencingAsync.mockResolvedValue(undefined);
  mocked.stopGeofencingAsync.mockResolvedValue(undefined);
});

describe('armAlarm', () => {
  it('registers one region under the known task and identifier', async () => {
    await armAlarm(destination);

    expect(mocked.startGeofencingAsync).toHaveBeenCalledWith(GEOFENCE_TASK_NAME, [
      expect.objectContaining({
        identifier: GEOFENCE_REGION_ID,
        latitude: destination.latitude,
        longitude: destination.longitude,
        radius: destination.radius,
      }),
    ]);
  });

  it('asks for arrivals only', async () => {
    await armAlarm(destination);

    const call = mocked.startGeofencingAsync.mock.calls[0];
    expect(call).toBeDefined();
    // Exits double the wake-ups the OS gives us, and every wake-up costs battery on a
    // device in someone's pocket. We only care about arriving.
    expect(call?.[1]?.[0]).toMatchObject({ notifyOnEnter: true, notifyOnExit: false });
  });

  it('persists armed state so a headless wake-up can read it', async () => {
    await armAlarm(destination);

    const state = await loadAlarmState();
    expect(state.status).toBe('armed');
    expect(state.status !== 'idle' && state.destination).toEqual(destination);
  });

  it('replaces a previous alarm rather than accumulating regions', async () => {
    await armAlarm(destination);
    const second = { ...destination, id: 'd2', name: 'Waterloo' };
    await armAlarm(second);

    // startGeofencingAsync replaces the whole region set for the task, which is what
    // makes "exactly one armed alarm" enforceable rather than merely intended.
    expect(mocked.startGeofencingAsync).toHaveBeenCalledTimes(2);
    const state = await loadAlarmState();
    expect(state.status !== 'idle' && state.destination.name).toBe('Waterloo');
  });
});

describe('disarmAlarm', () => {
  it('stops geofencing and returns to idle', async () => {
    mocked.hasStartedGeofencingAsync.mockResolvedValue(true);
    await armAlarm(destination);

    await disarmAlarm('user-cancelled');

    expect(mocked.stopGeofencingAsync).toHaveBeenCalledWith(GEOFENCE_TASK_NAME);
    await expect(loadAlarmState()).resolves.toEqual({ status: 'idle' });
  });
});

describe('stopGeofencing', () => {
  it('does not call stop when nothing is registered', async () => {
    mocked.hasStartedGeofencingAsync.mockResolvedValue(false);
    await stopGeofencing('nothing-there');
    expect(mocked.stopGeofencingAsync).not.toHaveBeenCalled();
  });

  it('reports a failure instead of throwing', async () => {
    mocked.hasStartedGeofencingAsync.mockResolvedValue(true);
    mocked.stopGeofencingAsync.mockRejectedValue(new Error('native failure'));

    await expect(stopGeofencing('arrived')).resolves.toBeUndefined();

    const entries = await readLog();
    expect(entries.some((e) => e.level === 'error')).toBe(true);
  });
});

describe('reconcileGeofence', () => {
  /**
   * The reboot case. Android does not restore geofences across a restart and drops
   * them on force-stop, with no callback either way — the app simply never hears from
   * the fence again. This is the cheap repair for the most likely "it didn't wake me
   * up" report.
   */
  it('re-arms a fence the OS dropped while state says armed', async () => {
    await saveAlarmState({ status: 'armed', destination, armedAt: 1_700_000_000_000 });
    mocked.hasStartedGeofencingAsync.mockResolvedValue(false);

    await expect(reconcileGeofence()).resolves.toBe('rearmed-missing-fence');

    expect(mocked.startGeofencingAsync).toHaveBeenCalledWith(GEOFENCE_TASK_NAME, [
      expect.objectContaining({ identifier: GEOFENCE_REGION_ID }),
    ]);
  });

  it('records why it re-armed, so a reboot is visible after the fact', async () => {
    await saveAlarmState({ status: 'armed', destination, armedAt: 1_700_000_000_000 });
    mocked.hasStartedGeofencingAsync.mockResolvedValue(false);

    await reconcileGeofence();

    const entries = await readLog();
    expect(entries.some((e) => e.message.includes('Re-armed'))).toBe(true);
  });

  it('removes an orphaned fence when nothing is armed', async () => {
    mocked.hasStartedGeofencingAsync.mockResolvedValue(true);

    await expect(reconcileGeofence()).resolves.toBe('removed-orphan-fence');
    expect(mocked.stopGeofencingAsync).toHaveBeenCalled();
  });

  it('does nothing when armed state and registration already agree', async () => {
    await saveAlarmState({ status: 'armed', destination, armedAt: 1_700_000_000_000 });
    mocked.hasStartedGeofencingAsync.mockResolvedValue(true);
    jest.clearAllMocks();

    await expect(reconcileGeofence()).resolves.toBe('nothing-to-do');
    expect(mocked.startGeofencingAsync).not.toHaveBeenCalled();
    expect(mocked.stopGeofencingAsync).not.toHaveBeenCalled();
  });

  it('does nothing when idle and no fence is registered', async () => {
    mocked.hasStartedGeofencingAsync.mockResolvedValue(false);
    await expect(reconcileGeofence()).resolves.toBe('nothing-to-do');
  });

  it('does not re-arm for a triggered alarm', async () => {
    // Already arrived. Re-registering would set a fence the user has finished with.
    await saveAlarmState({
      status: 'triggered',
      destination,
      armedAt: 1,
      triggeredAt: 2,
    });
    mocked.hasStartedGeofencingAsync.mockResolvedValue(false);

    await expect(reconcileGeofence()).resolves.toBe('nothing-to-do');
    expect(mocked.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('survives hasStartedGeofencingAsync throwing', async () => {
    mocked.hasStartedGeofencingAsync.mockRejectedValue(new Error('native blew up'));
    await expect(reconcileGeofence()).resolves.toBeDefined();
  });
});

describe('dismissAlarm', () => {
  it('moves triggered -> dismissed and records how long it rang', async () => {
    await saveAlarmState({
      status: 'triggered',
      destination,
      armedAt: 1_700_000_000_000,
      triggeredAt: Date.now() - 5000,
    });

    await dismissAlarm();

    const state = await loadAlarmState();
    expect(state.status).toBe('dismissed');

    const entries = await readLog();
    const dismissed = entries.find((e) => e.message === 'Alarm dismissed');
    expect(Number(dismissed?.data?.ringingForMs)).toBeGreaterThanOrEqual(5000);
  });

  it('is a no-op when no alarm is ringing', async () => {
    await saveAlarmState({ status: 'armed', destination, armedAt: 1 });

    await dismissAlarm();

    // Dismiss must not disarm a still-watching alarm just because it was invoked.
    expect((await loadAlarmState()).status).toBe('armed');
  });

  it('records the unexpected dismiss rather than failing silently', async () => {
    await dismissAlarm();
    const entries = await readLog();
    expect(entries.some((e) => e.level === 'warn')).toBe(true);
  });
});

describe('startGeofenceReconciliation', () => {
  it('reconciles immediately, without waiting for a foreground transition', async () => {
    // A cold launch after a reboot never produces a background -> active transition,
    // which is precisely the case the reboot repair exists for.
    await saveAlarmState({ status: 'armed', destination, armedAt: 1 });
    mocked.hasStartedGeofencingAsync.mockResolvedValue(false);

    const stop = startGeofenceReconciliation();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocked.startGeofencingAsync).toHaveBeenCalled();
    stop();
  });

  it('reconciles again when the app returns to the foreground', async () => {
    const stop = startGeofenceReconciliation();
    await new Promise((resolve) => setImmediate(resolve));

    // Captured BEFORE clearAllMocks, which wipes the recorded calls along with
    // everything else.
    const handler = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)?.[1];

    await saveAlarmState({ status: 'armed', destination, armedAt: 1 });
    mocked.hasStartedGeofencingAsync.mockResolvedValue(false);
    jest.clearAllMocks();

    handler('active');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocked.startGeofencingAsync).toHaveBeenCalled();
    stop();
  });

  it('ignores transitions to background', async () => {
    const stop = startGeofenceReconciliation();
    await new Promise((resolve) => setImmediate(resolve));

    const handler = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)?.[1];
    jest.clearAllMocks();

    handler('background');
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocked.hasStartedGeofencingAsync).not.toHaveBeenCalled();
    stop();
  });

  it('removes its listener when stopped', async () => {
    const stop = startGeofenceReconciliation();
    await new Promise((resolve) => setImmediate(resolve));
    stop();
    expect(removeListener).toHaveBeenCalled();
  });
});
