import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SettingsScreen from '../SettingsScreen';
import { DEFAULT_SETTINGS } from '../../types';
import { loadSettings } from '../../services/storage';

jest.mock('expo-location', () => ({
  getBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});

/**
 * The screen loads settings, destinations and permission status in one async effect.
 * With nothing stored, the settled state is identical to the initial state, so there
 * is no observable change for waitFor to latch onto — the effect resolves after the
 * test body finishes and React warns about a state update outside act(). Flushing the
 * effect inside act() here settles it before any assertion runs.
 */
async function renderSettings() {
  await act(async () => {
    render(<SettingsScreen />);
  });
}

describe('SettingsScreen', () => {
  it('renders the stored settings', async () => {
    await renderSettings();
    expect(screen.getByLabelText('Vibration').props.value).toBe(true);
    expect(screen.getByLabelText('Sound').props.value).toBe(true);
  });

  /**
   * Regression test for the MVP's one-render-late save.
   *
   * The old code called its save function immediately after setState and read state
   * inside it, so flipping Sound off persisted the PREVIOUS value — leaving storage
   * permanently one toggle behind the UI. Asserting on what actually landed in storage
   * rather than on the rendered switch is the whole point: the rendered value was
   * always right, and the stored one was always wrong.
   */
  it('persists the new value, not the previous one', async () => {
    await renderSettings();

    fireEvent(screen.getByLabelText('Sound'), 'valueChange', false);

    await waitFor(async () => {
      expect((await loadSettings()).soundEnabled).toBe(false);
    });
  });

  it('persists each of two toggles rather than lagging behind', async () => {
    await renderSettings();

    fireEvent(screen.getByLabelText('Sound'), 'valueChange', false);
    await waitFor(async () => expect((await loadSettings()).soundEnabled).toBe(false));

    fireEvent(screen.getByLabelText('Vibration'), 'valueChange', false);
    await waitFor(async () => {
      const stored = await loadSettings();
      // The lagging bug showed up most clearly here: the second write would persist
      // the first toggle's value and drop the second.
      expect(stored.vibrationEnabled).toBe(false);
      expect(stored.soundEnabled).toBe(false);
    });
  });

  it('preserves fields the user did not touch', async () => {
    await renderSettings();

    fireEvent(screen.getByLabelText('Sound'), 'valueChange', false);

    await waitFor(async () => {
      expect((await loadSettings()).maxAlarmDurationMs).toBe(
        DEFAULT_SETTINGS.maxAlarmDurationMs
      );
    });
  });

  it('shows an empty state when nothing is saved', async () => {
    await renderSettings();
    expect(screen.getByText('No saved locations')).toBeTruthy();
  });
});
