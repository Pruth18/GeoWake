import AsyncStorage from '@react-native-async-storage/async-storage';

import { appendLog, clearLog, formatEntry, readLog, MAX_ENTRIES } from '../debugLog';

const KEY = 'geowake.eventLog.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('appendLog / readLog', () => {
  it('starts empty', async () => {
    await expect(readLog()).resolves.toEqual([]);
  });

  it('round-trips an entry', async () => {
    await appendLog('info', 'Arrival detected', { destination: 'Kings Cross' });

    const entries = await readLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 'info',
      message: 'Arrival detected',
      data: { destination: 'Kings Cross' },
    });
    expect(entries[0].at).toBeGreaterThan(0);
  });

  it('returns newest first', async () => {
    // Reading the top of the list should answer "what just happened?" without paging.
    await appendLog('info', 'first');
    await appendLog('info', 'second');

    expect((await readLog()).map((e) => e.message)).toEqual(['second', 'first']);
  });

  it('accepts an entry with no data', async () => {
    await appendLog('warn', 'no detail');
    expect((await readLog())[0].data).toBeUndefined();
  });

  it('drops undefined values rather than storing them', async () => {
    // JSON.stringify silently omits undefined, which would fail the schema on the
    // way back in and lose the entry entirely.
    await appendLog('info', 'partial', { known: 'yes', missing: undefined });

    const entry = (await readLog())[0];
    expect(entry.data).toEqual({ known: 'yes' });
  });
});

describe('the ring buffer', () => {
  it(`caps at ${MAX_ENTRIES} entries`, async () => {
    for (let i = 0; i < MAX_ENTRIES + 25; i += 1) {
      await appendLog('info', `entry ${i}`);
    }
    expect(await readLog()).toHaveLength(MAX_ENTRIES);
  });

  it('discards the oldest, keeping the newest', async () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i += 1) {
      await appendLog('info', `entry ${i}`);
    }

    const messages = (await readLog()).map((e) => e.message);
    expect(messages[0]).toBe(`entry ${MAX_ENTRIES + 4}`);
    expect(messages).not.toContain('entry 0');
  });
});

describe('resilience', () => {
  it('returns empty for unparseable stored JSON', async () => {
    await AsyncStorage.setItem(KEY, 'not json');
    await expect(readLog()).resolves.toEqual([]);
  });

  it('returns empty when the stored value is not an array', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ nope: true }));
    await expect(readLog()).resolves.toEqual([]);
  });

  it('skips malformed entries but keeps valid ones', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify([
        { at: 1, level: 'info', message: 'good' },
        { at: 'not a number', level: 'info', message: 'bad' },
        { at: 2, level: 'nonsense', message: 'also bad' },
      ])
    );
    expect((await readLog()).map((e) => e.message)).toEqual(['good']);
  });

  it('never throws from appendLog — a failing log must not take down the alarm', async () => {
    await AsyncStorage.setItem(KEY, '{{{ broken');
    await expect(appendLog('info', 'still works')).resolves.toBeUndefined();
  });
});

describe('clearLog', () => {
  it('empties the log', async () => {
    await appendLog('info', 'something');
    await clearLog();
    await expect(readLog()).resolves.toEqual([]);
  });
});

describe('formatEntry', () => {
  it('renders time, level and message', () => {
    const line = formatEntry({
      at: Date.UTC(2026, 7, 22, 8, 14, 3),
      level: 'warn',
      message: 'Re-armed a dropped fence',
    });
    expect(line).toBe('08:14:03 [warn] Re-armed a dropped fence');
  });

  it('appends data when present', () => {
    const line = formatEntry({
      at: Date.UTC(2026, 7, 22, 8, 14, 3),
      level: 'info',
      message: 'Arrival',
      data: { destination: 'Kings Cross' },
    });
    expect(line).toContain('{"destination":"Kings Cross"}');
  });
});
