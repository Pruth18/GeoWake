/**
 * The name the geofence task is registered under.
 *
 * Kept in its own module with no imports and no side effects: geofence.ts needs the
 * name to start and stop geofencing, but importing geofenceTask.ts to get it would
 * run TaskManager.defineTask as a side effect from wherever geofence.ts is imported.
 * Registration must happen exactly once, from the app entry point.
 *
 * Changing this string orphans any fence already registered under the old name, which
 * the OS will keep firing into a task that no longer exists. Treat it as permanent.
 */
export const GEOFENCE_TASK_NAME = 'geowake-arrival-v1';
