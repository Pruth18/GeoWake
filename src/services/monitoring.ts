import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

import { appendLog } from './debugLog';
import { setStorageErrorReporter } from './storage';

const dsn = (Constants.expoConfig?.extra?.sentryDsn as string | undefined) ?? '';

let initialised = false;

/**
 * Starts crash reporting and routes storage failures into it.
 *
 * Deliberately does nothing when no DSN is configured, rather than throwing: the app
 * has to remain runnable for anyone who clones it without a Sentry account. The
 * persisted debug log is the local fallback and always works.
 */
export function initMonitoring(): void {
  if (initialised) return;
  initialised = true;

  if (dsn.length > 0) {
    Sentry.init({
      dsn,
      // Location coordinates are the most sensitive thing this app touches and they
      // never leave the device by design. Sending them to a crash reporter would
      // quietly contradict the privacy policy.
      sendDefaultPii: false,
      tracesSampleRate: 0.2,
    });
  }

  /**
   * Storage failures were previously only console.warn'd, which is invisible in a
   * release build and gone entirely when the headless task dies. They now land in the
   * persisted log and, where configured, in Sentry.
   */
  setStorageErrorReporter((context, error) => {
    void appendLog('error', `Storage failure: ${context}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    if (dsn.length > 0) {
      Sentry.captureException(error, { tags: { context } });
    }
  });
}

/** Breadcrumbs from the geofence path, so a crash report carries what led up to it. */
export function breadcrumb(message: string, data?: Record<string, unknown>): void {
  if (dsn.length === 0) return;
  Sentry.addBreadcrumb({ category: 'geofence', message, data, level: 'info' });
}

export const isMonitoringEnabled = (): boolean => dsn.length > 0;
