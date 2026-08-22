import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors, radii, spacing } from '../theme';
import { armAlarm, reconcileGeofence } from '../services/geofence';
import { clearLog, formatEntry, readLog, type LogEntry } from '../services/debugLog';
import { canDeliverNotifications } from '../services/notifications';
import { checkPermissions, type PermissionSnapshot } from '../services/permissions';
import { loadAlarmState } from '../services/storage';
import {
  cancelSimulatedArrival,
  scheduleSimulatedArrival,
  simulateArrival,
  DEFAULT_SIMULATE_DELAY_MS,
} from '../services/alarm/simulate';
import { isMonitoringEnabled } from '../services/monitoring';
import { GEOFENCE_TASK_NAME } from '../tasks/constants';
import { DEFAULT_RADIUS_M, type AlarmState } from '../types';

type Registry = {
  taskRegistered: boolean;
  geofencingStarted: boolean;
  notificationsAllowed: boolean;
};

/**
 * Present only in development and internal builds — app.config.ts sets
 * extra.enableDevTools false for the production profile.
 *
 * Everything here exists because the geofence path is otherwise unobservable: it runs
 * headless, on a moving train, on a device nobody is looking at.
 */
export default function DebugScreen() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [state, setState] = useState<AlarmState | null>(null);
  const [permissions, setPermissions] = useState<PermissionSnapshot | null>(null);
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const [log, alarmState, perms, taskRegistered, geofencingStarted, notificationsAllowed] =
      await Promise.all([
        readLog(),
        loadAlarmState(),
        checkPermissions(),
        TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME).catch(() => false),
        Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => false),
        canDeliverNotifications(),
      ]);

    setEntries(log);
    setState(alarmState);
    setPermissions(perms);
    setRegistry({ taskRegistered, geofencingStarted, notificationsAllowed });
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleSimulateNow = async () => {
    await simulateArrival();
    await refresh();
  };

  const handleSimulateDelayed = () => {
    scheduleSimulatedArrival(DEFAULT_SIMULATE_DELAY_MS);
    setPending(true);
    Alert.alert(
      'Arrival in 30 seconds',
      'Lock the phone and put it down. The alarm has to wake an idle device — that is the only version of this test that proves anything.'
    );
  };

  const handleCancelSimulation = () => {
    cancelSimulatedArrival();
    setPending(false);
  };

  /** Arms a fence at wherever you are standing, so you can trigger it on foot. */
  const handleFenceHere = async () => {
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await armAlarm({
        id: `debug-${Date.now()}`,
        name: 'Debug fence (here)',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        radius: DEFAULT_RADIUS_M,
        createdAt: Date.now(),
      });
      await refresh();
      Alert.alert('Fence armed here', 'Walk out past the radius and back in to trigger it.');
    } catch (error) {
      Alert.alert('Could not arm', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleReconcile = async () => {
    const outcome = await reconcileGeofence();
    await refresh();
    Alert.alert('Reconcile', outcome);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.warning}>
        Development build only. These controls are stripped from production.
      </Text>

      <Section title="Simulate arrival">
        <Text style={styles.note}>
          Runs a synthetic ENTER through the same handler the OS calls — not a shortcut to
          the alarm.
        </Text>
        <Button label="Simulate arrival now" onPress={handleSimulateNow} />
        <Button
          label="Simulate arrival in 30s"
          onPress={handleSimulateDelayed}
          emphasis
        />
        {pending && <Button label="Cancel pending simulation" onPress={handleCancelSimulation} />}
      </Section>

      <Section title="Alarm state">
        <Row label="Status" value={state?.status ?? '—'} />
        {state && state.status !== 'idle' && (
          <>
            <Row label="Destination" value={state.destination.name} />
            <Row label="Radius" value={`${state.destination.radius} m`} />
          </>
        )}
      </Section>

      <Section title="Registration">
        <Row label="Task registered" value={yesNo(registry?.taskRegistered)} />
        <Row label="Geofencing active" value={yesNo(registry?.geofencingStarted)} />
        <Button label="Reconcile now" onPress={handleReconcile} />
        <Button label="Arm a fence at my location" onPress={handleFenceHere} />
      </Section>

      <Section title="Permissions">
        <Row label="Location (foreground)" value={yesNo(permissions?.foreground)} />
        <Row label="Location (always)" value={yesNo(permissions?.background)} />
        <Row label="Notifications" value={yesNo(permissions?.notifications)} />
        <Row label="Can deliver notifications" value={yesNo(registry?.notificationsAllowed)} />
        <Row label="Crash reporting" value={isMonitoringEnabled() ? 'on' : 'not configured'} />
        {Platform.OS === 'android' && (
          <>
            <Text style={styles.note}>
              Aggressive battery optimisation on some devices (Xiaomi, Oppo, Vivo, Samsung)
              stops the app being woken even when the fence fires.
            </Text>
            <Button
              label="Open battery settings"
              onPress={() => Linking.openSettings()}
            />
          </>
        )}
      </Section>

      <Section title={`Event log (${entries.length})`}>
        <Text style={styles.note}>
          Written from inside the headless task. This is the only record of what happened
          while the phone was in your pocket.
        </Text>
        <Button
          label="Clear log"
          onPress={async () => {
            await clearLog();
            await refresh();
          }}
        />
        {entries.length === 0 ? (
          <Text style={styles.empty}>Nothing logged yet.</Text>
        ) : (
          entries.map((entry, index) => (
            <Text
              key={`${entry.at}-${index}`}
              style={[styles.logLine, entry.level === 'error' && styles.logError, entry.level === 'warn' && styles.logWarn]}
            >
              {formatEntry(entry)}
            </Text>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

const yesNo = (value: boolean | undefined) => (value === undefined ? '—' : value ? 'yes' : 'no');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  emphasis,
}: {
  label: string;
  onPress: () => void;
  emphasis?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, emphasis && styles.buttonEmphasis]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.buttonText, emphasis && styles.buttonTextEmphasis]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  warning: {
    backgroundColor: colors.warning,
    color: colors.onPrimary,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  note: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 17 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 13, color: colors.textMuted },
  rowValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  button: {
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  buttonEmphasis: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  buttonTextEmphasis: { color: colors.onAccent },
  empty: { fontSize: 13, color: colors.textFaint, fontStyle: 'italic' },
  logLine: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    color: colors.textMuted,
    paddingVertical: 2,
  },
  logWarn: { color: colors.warning },
  logError: { color: colors.danger },
});
