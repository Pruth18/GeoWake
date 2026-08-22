import { registerRootComponent } from 'expo';

/**
 * EVERYTHING IN THIS FILE RUNS AT MODULE SCOPE, AND THAT IS THE POINT.
 *
 * When a geofence fires with the app closed, Android boots the JS bundle and runs this
 * file — then looks for a registered task. It does NOT mount React. `registerRootComponent`
 * only registers a component; no effect, no hook and no component body ever executes.
 *
 * Anything the alarm needs must therefore be wired here. Putting alarm-critical setup in
 * an App-level useEffect makes it work perfectly in every foreground test and never run at
 * all on a real commute — the failure is invisible because the state transition and the
 * event log still look correct.
 */

// Registers the TaskManager task the OS calls on a region crossing.
import './src/tasks/geofenceTask';

// Points the effect executor at real alarm delivery (notification, sound, vibration).
// Without this the alarm decides correctly and then does nothing audible.
import { registerAlarmDelivery } from './src/services/alarm/delivery';

// Routes storage failures into the persisted event log, and Sentry when configured.
import { initMonitoring } from './src/services/monitoring';

// Channels must exist before a notification is posted to them; a notification posted to
// a missing channel loses MAX importance and its sound.
import { configureNotificationHandler, ensureAlarmChannels } from './src/services/notifications';

import App from './src/App';

initMonitoring();
registerAlarmDelivery();
configureNotificationHandler();
void ensureAlarmChannels();

registerRootComponent(App);
