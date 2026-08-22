import AsyncStorage from '@react-native-async-storage/async-storage';

import { appendLog } from './debugLog';
import {
  alarmStateSchema,
  destinationSchema,
  destinationV1Schema,
  migrateDestinationV1,
  migrateSettingsV1,
  settingsSchema,
  settingsV1Schema,
  DEFAULT_SETTINGS,
  IDLE_STATE,
  type AlarmSettings,
  type AlarmState,
  type Destination,
} from '../types';

/** Current keys. Versioned so a future shape change cannot silently misread old data. */
const KEYS = {
  destinations: 'geowake.destinations.v2',
  settings: 'geowake.settings.v2',
  alarmState: 'geowake.alarmState.v2',
} as const;

/** What the foreground-only MVP wrote. Read once, migrated, then left in place. */
const LEGACY_KEYS = {
  destinations: 'savedLocations',
  settings: 'settings',
} as const;

/**
 * Storage failures are reported through this hook rather than thrown.
 *
 * Every read here can run inside the headless geofence task, where there is no UI to
 * show an error and an exception would take the alarm down with it. Callers get a
 * usable default; the failure is still surfaced, never silently swallowed.
 *
 * Phase 4 points this at the persisted debug log and Sentry.
 */
export type StorageErrorReporter = (context: string, error: unknown) => void;

/**
 * Defaults to the persisted log, not console.
 *
 * These reads run inside the headless geofence task, where console output is invisible
 * and dies with the process. monitoring.ts upgrades this to also reach Sentry, but the
 * default must already be useful in case that never runs.
 */
let reportError: StorageErrorReporter = (context, error) => {
  void appendLog('error', `Storage failure: ${context}`, {
    error: error instanceof Error ? error.message : String(error),
  });
};

export function setStorageErrorReporter(reporter: StorageErrorReporter): void {
  reportError = reporter;
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

export async function loadDestinations(): Promise<Destination[]> {
  try {
    const current = await AsyncStorage.getItem(KEYS.destinations);
    if (current !== null) {
      return parseDestinationList(current);
    }

    const legacy = await AsyncStorage.getItem(LEGACY_KEYS.destinations);
    if (legacy === null) return [];

    const migrated = parseLegacyDestinationList(legacy);
    // Write forward so the migration runs once, not on every read. A failure here is
    // not fatal — the legacy key is left intact and migration retries next launch.
    await saveDestinations(migrated);
    return migrated;
  } catch (error) {
    reportError('loadDestinations', error);
    return [];
  }
}

export async function saveDestinations(destinations: Destination[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.destinations, JSON.stringify(destinations));
  } catch (error) {
    reportError('saveDestinations', error);
  }
}

export async function addDestination(destination: Destination): Promise<Destination[]> {
  const existing = await loadDestinations();
  const next = [...existing.filter((d) => d.id !== destination.id), destination];
  await saveDestinations(next);
  return next;
}

export async function removeDestination(id: string): Promise<Destination[]> {
  const existing = await loadDestinations();
  const next = existing.filter((d) => d.id !== id);
  await saveDestinations(next);
  return next;
}

export async function clearDestinations(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEYS.destinations, LEGACY_KEYS.destinations]);
  } catch (error) {
    reportError('clearDestinations', error);
  }
}

/**
 * Drops individual malformed records rather than failing the whole list. Losing one
 * corrupt entry is recoverable; losing every saved destination because of one bad
 * field is not.
 */
function parseDestinationList(raw: string): Destination[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    reportError('parseDestinationList', new Error('stored value is not an array'));
    return [];
  }

  const kept: Destination[] = [];
  parsed.forEach((entry, index) => {
    const result = destinationSchema.safeParse(entry);
    if (result.success) {
      kept.push(result.data);
    } else {
      reportError(`parseDestinationList[${index}]`, result.error);
    }
  });
  return kept;
}

function parseLegacyDestinationList(raw: string): Destination[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    reportError('parseLegacyDestinationList', new Error('legacy value is not an array'));
    return [];
  }

  const kept: Destination[] = [];
  parsed.forEach((entry, index) => {
    const result = destinationV1Schema.safeParse(entry);
    if (result.success) {
      kept.push(migrateDestinationV1(result.data));
    } else {
      reportError(`parseLegacyDestinationList[${index}]`, result.error);
    }
  });
  return kept;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function loadSettings(): Promise<AlarmSettings> {
  try {
    const current = await AsyncStorage.getItem(KEYS.settings);
    if (current !== null) {
      const result = settingsSchema.safeParse(JSON.parse(current));
      if (result.success) return result.data;
      reportError('loadSettings', result.error);
      return DEFAULT_SETTINGS;
    }

    const legacy = await AsyncStorage.getItem(LEGACY_KEYS.settings);
    if (legacy === null) return DEFAULT_SETTINGS;

    const result = settingsV1Schema.safeParse(JSON.parse(legacy));
    if (!result.success) {
      reportError('loadSettings(legacy)', result.error);
      return DEFAULT_SETTINGS;
    }

    const migrated = migrateSettingsV1(result.data);
    await saveSettings(migrated);
    return migrated;
  } catch (error) {
    reportError('loadSettings', error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AlarmSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
  } catch (error) {
    reportError('saveSettings', error);
  }
}

// ---------------------------------------------------------------------------
// Alarm state
// ---------------------------------------------------------------------------

/**
 * Read by the headless geofence task, which has no React tree and cannot reach any
 * in-memory store. This is the only channel through which a woken process learns what
 * the app was doing before it was killed.
 */
export type AlarmStateRead = {
  state: AlarmState;
  /**
   * False when the stored value could not be read or parsed.
   *
   * This distinction is load-bearing. A failed read also yields IDLE_STATE, and an
   * arrival while idle is treated as an orphaned region — which DEREGISTERS the fence.
   * Without this flag, one transient AsyncStorage failure would both miss the alarm and
   * permanently destroy it, and reconcile would never re-arm because it reads the same
   * `idle`. Removing a fence must require positive evidence of idleness, never merely
   * the absence of evidence.
   */
  ok: boolean;
};

export async function readAlarmState(): Promise<AlarmStateRead> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.alarmState);
    // Genuinely nothing stored — a real idle, not a failure.
    if (raw === null) return { state: IDLE_STATE, ok: true };

    const result = alarmStateSchema.safeParse(JSON.parse(raw));
    if (result.success) return { state: result.data, ok: true };

    reportError('loadAlarmState', result.error);
    return { state: IDLE_STATE, ok: false };
  } catch (error) {
    reportError('loadAlarmState', error);
    return { state: IDLE_STATE, ok: false };
  }
}

/** Convenience for UI callers, where a failed read and idle are equivalent. */
export async function loadAlarmState(): Promise<AlarmState> {
  return (await readAlarmState()).state;
}

/**
 * Returns whether the write actually landed.
 *
 * Callers must not assume success: arming is transactional across the OS fence and our
 * persisted state, and a silent write failure leaves the OS watching a region while our
 * state says something else — which produces a missed alarm that looks healthy.
 */
export async function saveAlarmState(state: AlarmState): Promise<boolean> {
  try {
    await AsyncStorage.setItem(KEYS.alarmState, JSON.stringify(state));
    return true;
  } catch (error) {
    reportError('saveAlarmState', error);
    return false;
  }
}
