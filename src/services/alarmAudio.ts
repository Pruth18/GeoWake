import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { appendLog } from './debugLog';
import { DEFAULT_MAX_ALARM_DURATION_MS } from '../types';

const ALARM_SOURCE = require('../../assets/sounds/alarm.wav');

let player: AudioPlayer | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sustains the alarm once the app is actually running.
 *
 * This is the SECONDARY mechanism. The notification channel sound is what wakes the
 * user, because the system plays it whether or not our JS process is alive — the
 * normal case for a phone that has been pocketed for twenty minutes. Starting looping
 * playback from a headless task is fragile: audio focus can be denied outright, and
 * there is no Activity to own the session. So this runs when it can and is never
 * relied upon.
 */
export async function startAlarmAudio(
  maxDurationMs: number = DEFAULT_MAX_ALARM_DURATION_MS
): Promise<void> {
  try {
    await setAudioModeAsync({
      // Plays despite the iOS mute switch and Android silent profile, for an
      // active session. This is a genuinely different and more permissive path
      // than notification sound, which respects the ringer.
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      // Ducking or mixing would let podcast audio bury the alarm.
      interruptionMode: 'doNotMix',
      shouldRouteThroughEarpiece: false,
    });

    stopTimer();
    if (!player) {
      player = createAudioPlayer(ALARM_SOURCE);
    }
    player.loop = true;
    player.volume = 1;
    player.play();

    /**
     * A phone in a bag must not scream until the battery dies. The alarm stops
     * itself after this long even if nobody dismisses it — the notification stays
     * visible, so the arrival is not lost, only the noise.
     */
    autoStopTimer = setTimeout(() => {
      void stopAlarmAudio('max-duration-reached');
    }, maxDurationMs);

    await appendLog('info', 'Alarm audio started', { maxDurationMs });
  } catch (error) {
    // Never fatal: the channel sound has already done the important part.
    await appendLog('warn', 'Alarm audio could not start; channel sound still applies', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function stopAlarmAudio(reason = 'dismissed'): Promise<void> {
  stopTimer();
  try {
    player?.pause();
    player?.remove();
  } catch {
    // Already torn down.
  } finally {
    player = null;
  }

  try {
    // Hands the audio session back so music and navigation resume normally.
    await setAudioModeAsync({ shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
  } catch {
    // Non-fatal.
  }

  await appendLog('info', 'Alarm audio stopped', { reason });
}

export function isAlarmAudioPlaying(): boolean {
  return player !== null;
}

function stopTimer(): void {
  if (autoStopTimer !== null) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
}
