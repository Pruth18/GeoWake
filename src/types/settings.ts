import { z } from 'zod';

/**
 * A phone left in a bag must not scream until the battery dies, so the alarm stops
 * itself. Five minutes is long enough to be unmissable and short enough to be tolerable.
 */
export const DEFAULT_MAX_ALARM_DURATION_MS = 5 * 60 * 1000;

export const settingsSchema = z.object({
  vibrationEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  maxAlarmDurationMs: z.number().int().positive(),
});

export type AlarmSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AlarmSettings = {
  vibrationEnabled: true,
  soundEnabled: true,
  maxAlarmDurationMs: DEFAULT_MAX_ALARM_DURATION_MS,
};

/**
 * v1 wrote only the two booleans, and wrote them one render late — the MVP called its
 * save function immediately after setState, persisting the previous value. Any stored
 * record may therefore disagree with what the user last saw on screen. Nothing can
 * recover the intended value, so v1 fields are read as-is and merged over defaults.
 */
export const settingsV1Schema = z.object({
  vibrationEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
});

export type SettingsV1 = z.infer<typeof settingsV1Schema>;

export function migrateSettingsV1(v1: SettingsV1): AlarmSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(v1.vibrationEnabled !== undefined && { vibrationEnabled: v1.vibrationEnabled }),
    ...(v1.soundEnabled !== undefined && { soundEnabled: v1.soundEnabled }),
  };
}
