/**
 * The MVP repeated these hex values across all four screens, so a palette change meant
 * editing four files and missing one. Same values, declared once.
 *
 * Contrast ratios below are WCAG 2.x, computed against `background` (#F5F5F7) and
 * `surface` (#FFFFFF). AA needs 4.5:1 for body text and 3:1 for large text and UI
 * boundaries. Several of these were originally chosen for looks and failed badly —
 * `accent` in particular was #10B981, which gives white-on-it 2.54:1 and was the app's
 * primary call-to-action.
 */
export const colors = {
  primary: '#1E3A8A', // 9.51 on bg · 10.36 on surface · white-on-it 10.36
  onPrimary: '#FFFFFF',

  /**
   * Was #10B981 (2.33 / 2.54, white-on-it 2.54 — failed everywhere it was used: the
   * main CTA, the selected radius pill, and the "Watching" status on the alarm screen).
   * Emerald-700 reads as the same green and clears AA in every direction.
   */
  accent: '#047857', // 5.04 on bg · 5.48 on surface · white-on-it 5.48
  onAccent: '#FFFFFF',

  /**
   * Never place `danger` on `background` — that pairing is 4.44:1 and just misses AA.
   * Every current usage sits on `surface` (5.32), which passes.
   */
  danger: '#DC2626', // 4.83 on surface · white-on-it 4.83
  /** Was #D97706 (2.93 / 3.19). Used for the "may alert late" reliability caveat. */
  warning: '#B45309', // 4.61 on bg · 5.02 on surface · white-on-it 5.02

  background: '#F5F5F7',
  surface: '#FFFFFF',

  text: '#333333', // 11.60 / 12.63
  textMuted: '#666666', // 5.27 / 5.74
  /** Was #999999 (2.62 / 2.85). */
  textFaint: '#707070', // 4.55 / 4.95

  /** Was #E5E7EB (1.24 on surface), below the 3:1 needed for a UI boundary. */
  border: '#C7CBD1',
  switchTrackOff: '#767577', // 4.58 on surface
  switchThumb: '#F4F3F4',
} as const;

/**
 * Geofence fill and stroke.
 *
 * These are `accent`'s channels written out, because rgba() cannot reference a hex
 * token. They must be updated by hand whenever `accent` changes — an earlier version
 * claimed to be "derived from the accent" while actually hardcoding the old #10B981,
 * so changing the token silently desynced the map overlay from the rest of the UI.
 */
export const mapOverlay = {
  fill: 'rgba(4, 120, 87, 0.2)',
  stroke: 'rgba(4, 120, 87, 0.5)',
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
 * Android's minimum touch target. Apply as `minHeight` (plus `justifyContent: 'center'`)
 * rather than `hitSlop`: hitSlop grows the touch rectangle but NOT the accessibility
 * node bounds, so a TalkBack user exploring by touch still has to find the original
 * undersized box.
 */
export const MIN_TOUCH_TARGET = 48;
