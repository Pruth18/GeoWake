import { registerRootComponent } from 'expo';

import App from './src/App';

/**
 * PHASE 3 will add here:
 *
 *   import './src/tasks/geofenceTask';
 *
 * That import must live at module scope in THIS file and must be a side-effect
 * import. When a geofence fires while the app is closed, Android boots the JS
 * engine and looks for a task registered under a known name — with no mounted
 * views and no React tree. A TaskManager.defineTask call placed inside a hook,
 * effect, or component would never have run at that point, and the alarm would
 * silently fail in exactly the situation the app exists for.
 *
 * Import it before registerRootComponent so registration is complete regardless
 * of whether the app was launched by the user or woken by the OS.
 */

registerRootComponent(App);
