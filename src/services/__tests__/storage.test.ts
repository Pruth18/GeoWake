import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_SETTINGS, type Destination } from '../../types';
import {
  addDestination,
  clearDestinations,
  loadAlarmState,
  loadDestinations,
  loadSettings,
  removeDestination,
  saveAlarmState,
  saveDestinations,
  saveSettings,
  setStorageErrorReporter,
} from '../storage';

const KEY_DESTINATIONS = 'geowake.destinations.v2';
const KEY_SETTINGS = 'geowake.settings.v2';
const LEGACY_DESTINATIONS = 'savedLocations';
const LEGACY_SETTINGS = 'settings';

const destination: Destination = {
  id: 'd1',
  name: 'Kings Cross',
  address: 'Euston Road, London',
  latitude: 51.5308,
  longitude: -0.1238,
  radius: 500,
  createdAt: 1_700_000_000_000,
};

let reported: string[] = [];

beforeEach(async () => {
  await AsyncStorage.clear();
  reported = [];
  setStorageErrorReporter((context) => {
    reported.push(context);
  });
});

describe('destinations', () => {
  it('returns an empty list when nothing is stored', async () => {
    await expect(loadDestinations()).resolves.toEqual([]);
  });

  it('round-trips a saved destination', async () => {
    await saveDestinations([destination]);
    await expect(loadDestinations()).resolves.toEqual([destination]);
  });

  it('adds and removes by id', async () => {
    await addDestination(destination);
    const second = { ...destination, id: 'd2', name: 'Waterloo' };
    await addDestination(second);
    await expect(loadDestinations()).resolves.toHaveLength(2);

    await removeDestination('d1');
    const remaining = await loadDestinations();
    expect(remaining.map((d) => d.id)).toEqual(['d2']);
  });

  it('replaces rather than duplicates when adding an existing id', async () => {
    await addDestination(destination);
    await addDestination({ ...destination, name: 'Renamed' });
    const all = await loadDestinations();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Renamed');
  });

  it('clears both current and legacy keys', async () => {
    await saveDestinations([destination]);
    await AsyncStorage.setItem(LEGACY_DESTINATIONS, JSON.stringify([]));
    await clearDestinations();
    await expect(AsyncStorage.getItem(KEY_DESTINATIONS)).resolves.toBeNull();
    await expect(AsyncStorage.getItem(LEGACY_DESTINATIONS)).resolves.toBeNull();
  });
});

describe('legacy v1 migration', () => {
  it('migrates MVP-shaped records on first read', async () => {
    await AsyncStorage.setItem(
      LEGACY_DESTINATIONS,
      JSON.stringify([
        {
          id: '1699999999999',
          name: 'Kings Cross',
          address: 'Euston Road',
          latitude: 51.5308,
          longitude: -0.1238,
          radius: 500,
        },
      ])
    );

    const loaded = await loadDestinations();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Kings Cross');
    expect(loaded[0].createdAt).toBe(1699999999999);
  });

  it('writes the migration forward so it runs once', async () => {
    await AsyncStorage.setItem(
      LEGACY_DESTINATIONS,
      JSON.stringify([
        { id: '1699999999999', name: 'A', latitude: 1, longitude: 2, radius: 500 },
      ])
    );

    await loadDestinations();
    const written = await AsyncStorage.getItem(KEY_DESTINATIONS);
    expect(written).not.toBeNull();
    expect(JSON.parse(written as string)).toHaveLength(1);
  });

  it('prefers current data over legacy when both exist', async () => {
    await saveDestinations([destination]);
    await AsyncStorage.setItem(
      LEGACY_DESTINATIONS,
      JSON.stringify([{ id: 'old', name: 'Stale', latitude: 1, longitude: 2, radius: 500 }])
    );

    const loaded = await loadDestinations();
    expect(loaded.map((d) => d.id)).toEqual(['d1']);
  });
});

describe('corrupt data', () => {
  it('drops a single malformed record but keeps the rest', async () => {
    await AsyncStorage.setItem(
      KEY_DESTINATIONS,
      JSON.stringify([destination, { id: 'broken' }, { ...destination, id: 'd3' }])
    );

    const loaded = await loadDestinations();
    // Losing every saved destination because one field went bad would be far worse
    // than losing the one bad record.
    expect(loaded.map((d) => d.id)).toEqual(['d1', 'd3']);
    expect(reported.some((c) => c.startsWith('parseDestinationList['))).toBe(true);
  });

  it('returns empty for unparseable JSON and reports it', async () => {
    await AsyncStorage.setItem(KEY_DESTINATIONS, 'not json at all');
    await expect(loadDestinations()).resolves.toEqual([]);
    expect(reported).toContain('loadDestinations');
  });

  it('returns empty when the stored value is not an array', async () => {
    await AsyncStorage.setItem(KEY_DESTINATIONS, JSON.stringify({ nope: true }));
    await expect(loadDestinations()).resolves.toEqual([]);
    expect(reported).toContain('parseDestinationList');
  });

  it('never throws — the headless task has no UI to catch an error', async () => {
    await AsyncStorage.setItem(KEY_DESTINATIONS, '{{{');
    await AsyncStorage.setItem(KEY_SETTINGS, '{{{');
    await expect(loadDestinations()).resolves.toBeDefined();
    await expect(loadSettings()).resolves.toBeDefined();
    await expect(loadAlarmState()).resolves.toBeDefined();
  });
});

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips', async () => {
    const next = { ...DEFAULT_SETTINGS, soundEnabled: false };
    await saveSettings(next);
    await expect(loadSettings()).resolves.toEqual(next);
  });

  it('migrates v1 settings and backfills fields it never had', async () => {
    await AsyncStorage.setItem(
      LEGACY_SETTINGS,
      JSON.stringify({ vibrationEnabled: false, soundEnabled: true })
    );

    const loaded = await loadSettings();
    expect(loaded.vibrationEnabled).toBe(false);
    expect(loaded.soundEnabled).toBe(true);
    expect(loaded.maxAlarmDurationMs).toBe(DEFAULT_SETTINGS.maxAlarmDurationMs);
  });

  it('falls back to defaults for corrupt settings', async () => {
    await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify({ vibrationEnabled: 'yes' }));
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    expect(reported).toContain('loadSettings');
  });
});

describe('alarm state', () => {
  it('defaults to idle', async () => {
    await expect(loadAlarmState()).resolves.toEqual({ status: 'idle' });
  });

  it('round-trips an armed state', async () => {
    const armed = { status: 'armed', destination, armedAt: 1_700_000_000_000 } as const;
    await saveAlarmState(armed);
    await expect(loadAlarmState()).resolves.toEqual(armed);
  });

  it('rejects a state with an invalid discriminant and falls back to idle', async () => {
    await AsyncStorage.setItem('geowake.alarmState.v2', JSON.stringify({ status: 'exploded' }));
    await expect(loadAlarmState()).resolves.toEqual({ status: 'idle' });
    expect(reported).toContain('loadAlarmState');
  });

  it('rejects an armed state carrying a corrupt destination', async () => {
    await AsyncStorage.setItem(
      'geowake.alarmState.v2',
      JSON.stringify({ status: 'armed', destination: { id: 'x' }, armedAt: 1 })
    );
    await expect(loadAlarmState()).resolves.toEqual({ status: 'idle' });
  });
});
