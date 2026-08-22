import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import type { LogData } from '../types';

const KEY = 'geowake.eventLog.v1';

/**
 * Enough to cover several days of commuting without unbounded growth. Entries are
 * small; the cap exists so a runaway loop cannot fill the device.
 */
export const MAX_ENTRIES = 200;

export const logEntrySchema = z.object({
  at: z.number().int().positive(),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;

/**
 * A persisted ring buffer, written from inside the geofence task.
 *
 * The task runs headless: no UI, no attached debugger, and console output is gone the
 * moment the process dies. When a user reports "it didn't wake me up", this is the
 * only evidence that can distinguish "the fence never fired" from "it fired and the
 * notification was suppressed" from "the state said dismissed". It has to exist
 * before the first real commute, not after the first bug report.
 */
export async function appendLog(
  level: LogEntry['level'],
  message: string,
  data?: LogData
): Promise<void> {
  try {
    const existing = await readLog();
    const entry: LogEntry = {
      at: Date.now(),
      level,
      message,
      ...(data ? { data: stripUndefined(data) } : {}),
    };
    // Newest first, so reading the top of the list answers "what just happened?".
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A failing debug log must never take down the alarm it exists to explain.
  }
}

export async function readLog(): Promise<LogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const kept: LogEntry[] = [];
    for (const entry of parsed) {
      const result = logEntrySchema.safeParse(entry);
      if (result.success) kept.push(result.data);
    }
    return kept;
  } catch {
    return [];
  }
}

export async function clearLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing useful to do — this is a debug affordance.
  }
}

/** JSON.stringify drops undefined values, which would fail a later schema round-trip. */
function stripUndefined(data: LogData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Formats one entry for the on-device log viewer. */
export function formatEntry(entry: LogEntry): string {
  const time = new Date(entry.at).toISOString().slice(11, 19);
  const detail = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `${time} [${entry.level}] ${entry.message}${detail}`;
}
