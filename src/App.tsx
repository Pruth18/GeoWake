import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './navigation/AppNavigator';
import { startGeofenceReconciliation } from './services/geofence';

export default function App() {
  useEffect(() => {
    /**
     * Repairs the gap between what we think is armed and what the OS actually holds.
     *
     * Android does not restore geofences across a device reboot and drops them on
     * force-stop, without telling the app either way. Reconciling on launch and on
     * every return to the foreground re-registers a dropped fence and clears an
     * orphaned one. It cannot help a phone rebooted overnight and never opened before
     * the journey — whether that gap justifies a native boot receiver is a Phase 5
     * decision to be made from measurement.
     */
    return startGeofenceReconciliation();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
