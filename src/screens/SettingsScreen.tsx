import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors, radii, spacing, MIN_TOUCH_TARGET } from '../theme';
import { formatDistance } from '../lib/geo';
import {
  clearDestinations,
  loadDestinations,
  loadSettings,
  removeDestination,
  saveSettings,
} from '../services/storage';
import { DEFAULT_SETTINGS, type AlarmSettings, type Destination } from '../types';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AlarmSettings>(DEFAULT_SETTINGS);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [backgroundGranted, setBackgroundGranted] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const [loadedSettings, loadedDestinations, background] = await Promise.all([
        loadSettings(),
        loadDestinations(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      if (!active) return;

      setSettings(loadedSettings);
      setDestinations(loadedDestinations);
      setBackgroundGranted(background.status === 'granted');
    })();

    return () => {
      active = false;
    };
  }, []);

  /**
   * Persists the value being set, not the value in state.
   *
   * The MVP called its save function immediately after setState and then read state
   * inside it — so it always wrote the PREVIOUS value, and the stored settings lagged
   * the UI by one toggle. Computing `next` here and passing it to both setState and
   * the write removes the race entirely.
   */
  const updateSettings = useCallback(
    async (patch: Partial<AlarmSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await saveSettings(next);
    },
    [settings]
  );

  const toggleBackgroundLocation = async () => {
    if (backgroundGranted) {
      Alert.alert(
        'Revoke in system settings',
        'Android only lets you grant background location from inside the app. To turn it off, use Settings → Apps → GeoWake → Permissions.'
      );
      return;
    }

    // Background permission is only grantable once foreground is already granted;
    // requesting it cold is rejected outright.
    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      const requested = await Location.requestForegroundPermissionsAsync();
      if (requested.status !== 'granted') {
        Alert.alert(
          'Location access needed first',
          'GeoWake needs ordinary location access before Android will offer the background option.'
        );
        return;
      }
    }

    const { status } = await Location.requestBackgroundPermissionsAsync();
    setBackgroundGranted(status === 'granted');

    if (status !== 'granted') {
      Alert.alert(
        'Background location denied',
        'Without it the alarm can only fire while GeoWake is open on screen — which defeats the point.'
      );
    }
  };

  const handleDelete = (destination: Destination) => {
    Alert.alert('Delete location', `Remove "${destination.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => setDestinations(await removeDestination(destination.id)),
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert('Clear all locations', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: async () => {
          await clearDestinations();
          setDestinations([]);
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Alarm
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Vibration</Text>
          <Switch
            value={settings.vibrationEnabled}
            onValueChange={(value) => updateSettings({ vibrationEnabled: value })}
            trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
            thumbColor={colors.switchThumb}
            accessibilityLabel="Vibration"
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Sound</Text>
          <Switch
            value={settings.soundEnabled}
            onValueChange={(value) => updateSettings({ soundEnabled: value })}
            trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
            thumbColor={colors.switchThumb}
            accessibilityLabel="Sound"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Background location</Text>
          <Switch
            value={backgroundGranted}
            onValueChange={toggleBackgroundLocation}
            trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
            thumbColor={colors.switchThumb}
            accessibilityLabel="Background location"
          />
        </View>

        <Text style={styles.note}>
          Required for the alarm to work when GeoWake is closed or your phone is locked.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved locations ({destinations.length})</Text>

        {destinations.length > 0 ? (
          destinations.map((destination) => (
            <View key={destination.id} style={styles.item}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{destination.name}</Text>
                {destination.address ? (
                  <Text style={styles.itemAddress}>{destination.address}</Text>
                ) : null}
                <Text style={styles.itemRadius}>{formatDistance(destination.radius)} radius</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(destination)}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${destination.name}`}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No saved locations</Text>
        )}

        {destinations.length > 0 && (
          <TouchableOpacity
            style={styles.clearAllButton}
            onPress={handleClearAll}
            accessibilityRole="button"
          >
            <Text style={styles.clearAllButtonText}>Clear all locations</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  section: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  label: { fontSize: 16, color: colors.text },
  note: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemInfo: { flex: 1, paddingRight: spacing.md },
  itemName: { fontSize: 16, fontWeight: '600', color: colors.text },
  itemAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  itemRadius: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  // minHeight rather than hitSlop: hitSlop grows the touch rectangle but not the
  // accessibility node bounds, so a TalkBack user exploring by touch would still have
  // to land on the original ~33dp box. This one is destructive, so it matters more.
  deleteButton: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.danger,
  },
  deleteButtonText: { color: colors.onPrimary, fontWeight: '600' },
  emptyText: { fontSize: 15, color: colors.textFaint, fontStyle: 'italic' },
  clearAllButton: {
    marginTop: spacing.md,
    paddingVertical: 12,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
  },
  clearAllButtonText: { color: colors.danger, fontWeight: '600' },
});
