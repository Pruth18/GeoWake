/**
 * The MVP repeated these hex values across all four screens, so a palette change meant
 * editing four files and missing one. Same values, declared once.
 */
export const colors = {
  primary: '#1E3A8A',
  onPrimary: '#FFFFFF',

  accent: '#10B981',
  onAccent: '#FFFFFF',

  danger: '#DC2626',
  warning: '#D97706',

  background: '#F5F5F7',
  surface: '#FFFFFF',

  text: '#333333',
  textMuted: '#666666',
  textFaint: '#999999',

  border: '#E5E7EB',
  switchTrackOff: '#767577',
  switchThumb: '#F4F3F4',
} as const;

/** Geofence fill and stroke, derived from the accent so they stay in step with it. */
export const mapOverlay = {
  fill: 'rgba(16, 185, 129, 0.2)',
  stroke: 'rgba(16, 185, 129, 0.5)',
  strokeWidth: 2,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 15,
  lg: 20,
  xl: 30,
} as const;

export const radii = {
  sm: 8,
  md: 10,
  lg: 20,
} as const;

/**
 * Android's minimum touch target is 48dp. The alarm's dismiss control is deliberately
 * much larger than this — see AlarmScreen.
 */
export const MIN_TOUCH_TARGET = 48;
