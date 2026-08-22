import AsyncStorage from '@react-native-async-storage/async-storage';

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  remove: jest.fn(),
  loop: false,
  volume: 0,
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { isAlarmAudioPlaying, startAlarmAudio, stopAlarmAudio } from '../alarmAudio';
import { readLog } from '../debugLog';

const mockedSetMode = setAudioModeAsync as jest.Mock;
const mockedCreate = createAudioPlayer as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockedSetMode.mockResolvedValue(undefined);
  mockedCreate.mockReturnValue(mockPlayer);
  mockPlayer.loop = false;
  mockPlayer.volume = 0;
});

afterEach(async () => {
  await stopAlarmAudio('test-cleanup');
  jest.useRealTimers();
});

describe('startAlarmAudio', () => {
  it('plays in silent mode', async () => {
    await startAlarmAudio();

    // playsInSilentMode is a genuinely more permissive path than notification sound,
    // which respects the ringer switch.
    expect(mockedSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: true })
    );
  });

  it('does NOT request background playback', async () => {
    await startAlarmAudio();

    // Background playback would require a mediaPlayback foreground service — the wrong
    // Play category for an alarm, needing its own declaration. It is also unnecessary:
    // the system plays the notification channel sound, which is what covers the
    // backgrounded case. This asserts the permission surface stays small.
    expect(mockedSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ shouldPlayInBackground: false })
    );
  });

  it('refuses to mix, so podcast audio cannot bury the alarm', async () => {
    await startAlarmAudio();
    expect(mockedSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ interruptionMode: 'doNotMix' })
    );
  });

  it('loops at full volume', async () => {
    await startAlarmAudio();
    expect(mockPlayer.loop).toBe(true);
    expect(mockPlayer.volume).toBe(1);
    expect(mockPlayer.play).toHaveBeenCalled();
  });

  it('reports as playing', async () => {
    await startAlarmAudio();
    expect(isAlarmAudioPlaying()).toBe(true);
  });

  it('stops itself after the max duration', async () => {
    // A phone in a bag must not scream until the battery dies.
    await startAlarmAudio(60_000);
    expect(isAlarmAudioPlaying()).toBe(true);

    jest.advanceTimersByTime(60_000);
    await Promise.resolve();

    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  it('does not stop before the max duration', async () => {
    await startAlarmAudio(60_000);
    jest.advanceTimersByTime(59_000);
    await Promise.resolve();
    expect(mockPlayer.pause).not.toHaveBeenCalled();
  });

  it('degrades to a warning when audio cannot start', async () => {
    mockedSetMode.mockRejectedValue(new Error('audio focus denied'));

    await expect(startAlarmAudio()).resolves.toBeUndefined();

    const entries = await readLog();
    const warned = entries.find((e) => e.message.includes('could not start'));
    // Never an error: the channel sound has already done the important part, so a
    // failure here is a degradation rather than a broken alarm.
    expect(warned?.level).toBe('warn');
  });
});

describe('stopAlarmAudio', () => {
  it('tears the player down', async () => {
    await startAlarmAudio();
    await stopAlarmAudio('dismissed');

    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(mockPlayer.remove).toHaveBeenCalled();
    expect(isAlarmAudioPlaying()).toBe(false);
  });

  it('hands the audio session back so music can resume', async () => {
    await startAlarmAudio();
    mockedSetMode.mockClear();

    await stopAlarmAudio('dismissed');

    expect(mockedSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ interruptionMode: 'mixWithOthers' })
    );
  });

  it('cancels the pending auto-stop', async () => {
    await startAlarmAudio(60_000);
    await stopAlarmAudio('dismissed');
    mockPlayer.pause.mockClear();

    jest.advanceTimersByTime(60_000);
    await Promise.resolve();

    // Firing after an explicit stop would tear down a player that may since have been
    // restarted by a second alarm.
    expect(mockPlayer.pause).not.toHaveBeenCalled();
  });

  it('is safe when nothing is playing', async () => {
    await expect(stopAlarmAudio()).resolves.toBeUndefined();
  });

  it('does not throw when teardown fails', async () => {
    await startAlarmAudio();
    mockPlayer.remove.mockImplementation(() => {
      throw new Error('already gone');
    });
    await expect(stopAlarmAudio()).resolves.toBeUndefined();
    mockPlayer.remove.mockImplementation(() => {});
  });
});
