import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, radii, spacing, MIN_TOUCH_TARGET } from '../theme';
import { loadDestinations } from '../services/storage';
import { formatDistance } from '../lib/geo';
import type { Destination } from '../types';
import { devToolsEnabled } from '../config';
import type { RootStackScreenProps } from '../navigation/types';

export default function HomeScreen({ navigation }: RootStackScreenProps<'Home'>) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      // The screen can unmount while the permission dialog is open; without this the
      // setState lands on a dead component.
      if (!active) return;

      const granted = status === 'granted';
      setHasLocationPermission(granted);

      if (!granted) {
        Alert.alert(
          'Permission required',
          'GeoWake needs location access to detect when you arrive. You can enable it in Settings.',
          [{ text: 'OK' }]
        );
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  /**
   * Reloads whenever the screen regains focus, not just on mount. The MVP loaded once
   * in a mount effect, so a destination saved on the Map screen never appeared here
   * until the app was restarted — the screen stays mounted underneath in a stack.
   */
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadDestinations().then((loaded) => {
        if (active) setDestinations(loaded);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const handleSetNewAlarm = () => {
    if (hasLocationPermission === false) {
      Alert.alert(
        'Location permission required',
        'Enable location access for GeoWake in your device settings to set an alarm.',
        [{ text: 'OK' }]
      );
      return;
    }
    navigation.navigate('Map');
  };

  const renderDestination = ({ item }: { item: Destination }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => navigation.navigate('Alarm', { destination: item })}
      accessibilityRole="button"
      // Includes the address: an accessibilityLabel overrides the children, so without
      // it the address rendered below becomes unreachable to a screen reader.
      accessibilityLabel={[
        `Set alarm for ${item.name}`,
        item.address,
        `${formatDistance(item.radius)} radius`,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <Text style={styles.itemName}>{item.name}</Text>
      {item.address ? <Text style={styles.itemAddress}>{item.address}</Text> : null}
      <Text style={styles.itemRadius}>{formatDistance(item.radius)} radius</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Welcome to GeoWake
        </Text>
        <Text style={styles.subtitle}>Never miss your stop again</Text>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleSetNewAlarm}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Set New Alarm</Text>
      </TouchableOpacity>

      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>Saved Locations</Text>
        {destinations.length > 0 ? (
          <FlatList
            data={destinations}
            renderItem={renderDestination}
            keyExtractor={(item) => item.id}
            style={styles.list}
          />
        ) : (
          <Text style={styles.emptyText}>No saved locations yet</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('Settings')}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Settings</Text>
      </TouchableOpacity>

      {devToolsEnabled && (
        <TouchableOpacity
          style={styles.debugButton}
          onPress={() => navigation.navigate('Debug')}
          accessibilityRole="button"
        >
          <Text style={styles.debugButtonText}>Debug tools</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  header: { marginTop: spacing.lg, marginBottom: spacing.xl, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.primary, marginBottom: spacing.sm },
  subtitle: { fontSize: 16, color: colors.textMuted },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    marginBottom: 25,
    elevation: 2,
  },
  primaryButtonText: { color: colors.onAccent, fontSize: 18, fontWeight: 'bold' },
  listSection: { flex: 1, marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: spacing.md,
    color: colors.text,
  },
  list: { flex: 1 },
  item: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
    elevation: 1,
  },
  itemName: { fontSize: 18, fontWeight: 'bold', color: colors.primary, marginBottom: spacing.xs },
  itemAddress: { fontSize: 14, color: colors.textMuted },
  itemRadius: { fontSize: 12, color: colors.textFaint, marginTop: spacing.xs },
  emptyText: {
    fontSize: 16,
    color: colors.textFaint,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  secondaryButton: {
    backgroundColor: colors.textMuted,
    paddingVertical: 12,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: radii.md,
    alignItems: 'center',
  },
  debugButton: {
    marginTop: spacing.sm,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    alignItems: 'center',
  },
  debugButtonText: { color: colors.warning, fontSize: 13, fontWeight: '600' },
});
