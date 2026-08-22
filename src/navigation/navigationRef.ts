import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * Lets non-component code navigate — specifically the notification-response listener,
 * which fires from App.tsx's effect and may run before any screen has mounted (when a
 * notification tap is what launched the app).
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
