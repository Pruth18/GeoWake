import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './navigation/AppNavigator';
import { navigationRef } from './navigation/navigationRef';
import { appendLog } from './services/debugLog';
import { startGeofenceReconciliation } from './services/geofence';
import { ARRIVAL_NOTIFICATION_TAG } from './services/notifications';
import { loadAlarmState } from './services/storage';

/**
 * Alarm-critical initialisation is NOT here. It lives at module scope in index.ts,
 * because a geofence firing with the app closed never mounts React — so anything set up
 * in an effect would work in every foreground test and never run on a real commute.
 * Only genuinely UI-scoped concerns belong in this component.
 */
export default function App() {
  useEffect(() => {
    /**
     * Repairs the gap between what we believe is armed and what the OS actually holds.
     *
     * Android does not restore geofences across a reboot and drops them on force-stop,
     * telling the app neither time. Reconciling on launch and on every foreground
     * re-registers a dropped fence and clears an orphaned one.
     */
    return startGeofenceReconciliation();
  }, []);

  /**
   * The response that LAUNCHED the app, plus any received while it runs.
   *
   * A plain addNotificationResponseReceivedListener misses the cold-start case: the
   * launching response is delivered as soon as the listener registers, which is before
   * NavigationContainer is ready — and a tap that cold-launches the app is the normal
   * path for someone who was asleep. Previously that tap was dropped silently, leaving
   * the user on Home with a sticky notification they could not clear and state stuck at
   * `triggered`. This hook is built for exactly that case.
   */
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!lastResponse) return;

    const data = lastResponse.notification.request.content.data;
    if (data?.tag !== ARRIVAL_NOTIFICATION_TAG) return;

    let active = true;

    void (async () => {
      const state = await loadAlarmState();
      if (!active) return;

      if (state.status === 'idle') {
        await appendLog('warn', 'Notification tap ignored: no alarm in progress');
        return;
      }

      /**
       * Retries rather than dropping. The hook can deliver before the container mounts;
       * bailing out silently is what made a cold-launch tap go nowhere. Bounded so a
       * genuinely broken container cannot spin forever.
       */
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (!active) return;
        if (navigationRef.isReady()) {
          navigationRef.navigate('Alarm', { destination: state.destination });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await appendLog('error', 'Could not open the alarm screen from a notification tap', {
        destination: state.destination.name,
      });
    })();

    return () => {
      active = false;
    };
  }, [lastResponse]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
