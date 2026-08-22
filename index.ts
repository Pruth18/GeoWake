import { registerRootComponent } from 'expo';

/**
 * Side-effect import: registers the geofence task at module scope.
 *
 * This must stay in THIS file, above registerRootComponent, and must not be imported
 * anywhere else. When a fence fires with the app closed, Android boots the JS engine
 * and looks for a task registered under a known name — with no mounted views and no
 * React tree. A TaskManager.defineTask call inside a hook or component would not have
 * run at that point, and the alarm would silently fail in exactly the situation the
 * app exists for.
 *
 * Registering before the root component means it is in place whether the app was
 * launched by the user or woken by the OS.
 */
import './src/tasks/geofenceTask';

import App from './src/App';

registerRootComponent(App);
