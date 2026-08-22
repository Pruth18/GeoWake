import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './navigation/AppNavigator';
import { navigationRef } from './navigation/navigationRef';
import { registerAlarmDelivery } from './services/alarm/delivery';
import { startGeofenceReconciliation } from './services/geofence';
import { initMonitoring } from './services/monitoring';
import {
  ARRIVAL_NOTIFICATION_TAG,
  configureNotificationHandler,
  ensureAlarmChannels,
} from './services/notifications';
import { loadAlarmState } from './services/storage';

// Module scope on purpose: the notification handler must be configured before any
// notification can arrive, including one that launched the app.
configureNotificationHandler();

export default function App() {
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    initMonitoring();
    // Points the effect executor at real delivery. Until this runs, a `startAlarm`
    // effect only writes a log line.
    registerAlarmDelivery();
    void ensureAlarmChannels();
  }, []);

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

  useEffect(() => {
    /**
     * Routes a notification tap to the alarm screen so the user can stop it.
     *
     * The destination is read from persisted state rather than the notification
     * payload: the payload could be from an older alarm still sitting in the shade,
     * and acting on it would open a screen for something that is no longer armed.
     */
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.tag !== ARRIVAL_NOTIFICATION_TAG) return;

      void (async () => {
        const state = await loadAlarmState();
        if (state.status === 'idle') return;
        // A tap can launch the app cold, arriving before the container mounts.
        if (!navigationRef.isReady()) return;
        navigationRef.navigate('Alarm', { destination: state.destination });
      })();
    });

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
