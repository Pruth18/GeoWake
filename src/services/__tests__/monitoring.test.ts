import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import * as Sentry from '@sentry/react-native';

import { breadcrumb, initMonitoring, isMonitoringEnabled } from '../monitoring';
import { readLog } from '../debugLog';
import { loadDestinations } from '../storage';

const mockedSentry = Sentry as jest.Mocked<typeof Sentry>;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

/** Lets a fire-and-forget append settle before the log is read. */
const flushPending = () => new Promise((resolve) => setImmediate(resolve));

/**
 * No DSN is configured in the test environment, which is also the state of any clone
 * without a Sentry account. The app has to stay fully functional in that state — the
 * persisted debug log is the fallback and always works.
 */
describe('with no DSN configured', () => {
  it('reports monitoring as disabled', () => {
    expect(isMonitoringEnabled()).toBe(false);
  });

  it('does not initialise Sentry', () => {
    initMonitoring();
    expect(mockedSentry.init).not.toHaveBeenCalled();
  });

  it('does not throw', () => {
    expect(() => initMonitoring()).not.toThrow();
  });

  it('drops breadcrumbs rather than buffering them', () => {
    breadcrumb('arrival detected', { destination: 'Kings Cross' });
    expect(mockedSentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    initMonitoring();
    initMonitoring();
    expect(mockedSentry.init).not.toHaveBeenCalled();
  });
});

describe('storage error routing', () => {
  it('sends storage failures to the persisted log', async () => {
    initMonitoring();

    // Corrupt data makes storage report through the injected reporter. Previously
    // these were only console.warn'd — invisible in a release build, and gone
    // entirely when the headless task dies.
    await AsyncStorage.setItem('geowake.destinations.v2', 'not json');
    await loadDestinations();
    // The reporter is a synchronous callback, so its append is fire-and-forget.
    await flushPending();

    const entries = await readLog();
    const failure = entries.find((e) => e.message.startsWith('Storage failure:'));
    expect(failure?.level).toBe('error');
  });

  it('does not call Sentry when no DSN is configured', async () => {
    initMonitoring();

    await AsyncStorage.setItem('geowake.destinations.v2', 'not json');
    await loadDestinations();

    expect(mockedSentry.captureException).not.toHaveBeenCalled();
  });
});
