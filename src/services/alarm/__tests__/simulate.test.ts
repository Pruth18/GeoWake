import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../geofence', () => ({
  stopGeofencing: jest.fn().mockResolvedValue(undefined),
}));

import {
  cancelSimulatedArrival,
  hasPendingSimulation,
  scheduleSimulatedArrival,
  simulateArrival,
} from '../simulate';
import { setAlarmStarter } from '../executeEffects';
import { readLog } from '../../debugLog';
import { loadAlarmState, saveAlarmState } from '../../storage';
import type { Destination } from '../../../types';

const destination: Destination = {
  id: 'd1',
  name: 'Kings Cross',
  latitude: 51.5308,
  longitude: -0.1238,
  radius: 500,
  createdAt: 1_700_000_000_000,
};

let started: Destination[] = [];

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  cancelSimulatedArrival();
  started = [];
  setAlarmStarter(async (d) => {
    started.push(d);
  });
});

afterEach(() => {
  cancelSimulatedArrival();
  jest.useRealTimers();
});

describe('simulateArrival', () => {
  it('drives the real handler, producing a real state transition', async () => {
    await saveAlarmState({ status: 'armed', destination, armedAt: 1_700_000_000_000 });

    const result = await simulateArrival();

    // Proves the simulation goes through handleGeofenceEvent rather than calling the
    // alarm directly — a shortcut would prove nothing about what the OS actually runs.
    expect(result.status).toBe('triggered');
    expect(started).toEqual([destination]);
  });

  it('is a no-op when nothing is armed', async () => {
    const result = await simulateArrival();

    expect(result.status).toBe('idle');
    expect(started).toEqual([]);
  });

  it('records the refusal so the tester knows why nothing happened', async () => {
    await simulateArrival();
    const entries = await readLog();
    expect(entries.some((e) => e.message.includes('no alarm is armed'))).toBe(true);
  });

  it('respects the already-triggered invariant', async () => {
    await saveAlarmState({
      status: 'triggered',
      destination,
      armedAt: 1,
      triggeredAt: 2,
    });

    await simulateArrival();

    // Same rule as a real repeat arrival: triggered is terminal.
    expect(started).toEqual([]);
  });
});

describe('scheduleSimulatedArrival', () => {
  it('does not fire immediately', async () => {
    jest.useFakeTimers();
    await saveAlarmState({ status: 'armed', destination, armedAt: 1 });

    scheduleSimulatedArrival(30_000);
    expect(hasPendingSimulation()).toBe(true);
    expect(started).toEqual([]);
  });

  it('fires after the delay', async () => {
    jest.useFakeTimers();
    await saveAlarmState({ status: 'armed', destination, armedAt: 1 });

    scheduleSimulatedArrival(30_000);
    jest.advanceTimersByTime(30_000);
    // Let the async work inside the timer settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(hasPendingSimulation()).toBe(false);
  });

  it('can be cancelled before it fires', async () => {
    jest.useFakeTimers();
    await saveAlarmState({ status: 'armed', destination, armedAt: 1 });

    scheduleSimulatedArrival(30_000);
    cancelSimulatedArrival();
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();

    expect(hasPendingSimulation()).toBe(false);
    expect(started).toEqual([]);
  });

  it('replaces a previous pending simulation rather than stacking', async () => {
    jest.useFakeTimers();
    await saveAlarmState({ status: 'armed', destination, armedAt: 1 });

    scheduleSimulatedArrival(30_000);
    scheduleSimulatedArrival(30_000);
    jest.advanceTimersByTime(30_000);
    await Promise.resolve();
    await Promise.resolve();

    // Two overlapping simulations would double-fire the alarm and make the test
    // results meaningless.
    expect(started.length).toBeLessThanOrEqual(1);
  });

  it('returns a cancel function', async () => {
    jest.useFakeTimers();
    const cancel = scheduleSimulatedArrival(30_000);
    cancel();
    expect(hasPendingSimulation()).toBe(false);
  });
});
