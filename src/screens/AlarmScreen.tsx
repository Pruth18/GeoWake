import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { colors, mapOverlay, radii, spacing } from '../theme';
import { distanceMeters, formatDistance } from '../lib/geo';
import { armAlarm, disarmAlarm, dismissAlarm } from '../services/geofence';
import { blockersForArming, requestAlarmPermissions } from '../services/permissions';
import { loadAlarmState } from '../services/storage';
import type { AlarmState } from '../types';
import type { RootStackScreenProps } from '../navigation/types';

/**
 * How often the screen re-reads persisted alarm state.
 *
 * Arrival is decided by the geofence task, which may run while this screen is not
 * even mounted. Storage is the only channel between that headless process and the UI,
 * so the screen polls rather than owning any detection logic of its own.
 */
const STATE_POLL_MS = 2000;

type Phase = 'preparing' | 'blocked' | 'ready' | 'failed';

export default function AlarmScreen({ navigation, route }: RootStackScreenProps<'Alarm'>) {
  const { destination } = route.params;

  const [phase, setPhase] = useState<Phase>('preparing');
  const [blockedReason, setBlockedReason] = useState<string>('');
  const [alarmState, setAlarmState] = useState<AlarmState | null>(null);
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  // Arm once, on mount.
  useEffect(() => {
    let active = true;

    (async () => {
      const permissions = await requestAlarmPermissions();
      const blockers = blockersForArming(permissions);

      if (!active) return;

      if (blockers.length > 0) {
        setBlockedReason(blockers.map((b) => b.message).join('\n\n'));
        setPhase('blocked');
        return;
      }

      try {
        await armAlarm(destination);
        if (active) setPhase('ready');
      } catch (error) {
        if (!active) return;
        // Arming is the whole point of this screen. If it fails the user must be told
        // outright rather than left looking at a screen that implies it is watching.
        setBlockedReason(
          error instanceof Error ? error.message : 'Could not start monitoring your location.'
        );
        setPhase('failed');
      }
    })();

    return () => {
      active = false;
    };
  }, [destination]);

  // Live distance readout. Cosmetic only — arrival is the geofence's job, never this.
  useEffect(() => {
    if (phase !== 'ready') return;
    let active = true;

    (async () => {
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 5000 },
        (position) => {
          if (!active) return;
          setCurrentDistance(distanceMeters(position.coords, destination));
        }
      );
      if (active) {
        watchRef.current = subscription;
      } else {
        subscription.remove();
      }
    })();

    return () => {
      active = false;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [phase, destination]);

  // Reflect whatever the headless task has written.
  useEffect(() => {
    let active = true;

    const poll = async () => {
      const state = await loadAlarmState();
      if (active) setAlarmState(state);
    };

    void poll();
    const timer = setInterval(poll, STATE_POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const handleCancel = useCallback(() => {
    Alert.alert('Cancel alarm', `Stop watching for ${destination.name}?`, [
      { text: 'Keep watching', style: 'cancel' },
      {
        text: 'Cancel alarm',
        style: 'destructive',
        onPress: async () => {
          await disarmAlarm('user-cancelled');
          navigation.goBack();
        },
      },
    ]);
  }, [destination.name, navigation]);

  const handleDismiss = useCallback(async () => {
    await dismissAlarm();
    setAlarmState(await loadAlarmState());
    navigation.goBack();
  }, [navigation]);

  if (phase === 'preparing') {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centredText}>Setting up your alarm…</Text>
      </View>
    );
  }

  if (phase === 'blocked' || phase === 'failed') {
    return (
      <View style={styles.centred}>
        <Text style={styles.blockedTitle}>
          {phase === 'blocked' ? 'Permissions needed' : 'Could not start the alarm'}
        </Text>
        <Text style={styles.blockedBody}>{blockedReason}</Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasArrived = alarmState?.status === 'triggered';

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: destination.latitude,
          longitude: destination.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
      >
        <Marker coordinate={destination} title={destination.name} pinColor="red" />
        <Circle
          center={destination}
          radius={destination.radius}
          fillColor={mapOverlay.fill}
          strokeColor={mapOverlay.stroke}
          strokeWidth={mapOverlay.strokeWidth}
        />
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.destinationName}>{destination.name}</Text>
        {destination.address ? (
          <Text style={styles.destinationAddress}>{destination.address}</Text>
        ) : null}

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text
            style={[styles.statusValue, hasArrived ? styles.arrived : styles.watching]}
            accessibilityLiveRegion="polite"
          >
            {hasArrived ? 'ARRIVED' : 'Watching'}
          </Text>
        </View>

        {currentDistance !== null && !hasArrived && (
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Distance</Text>
            <Text style={styles.statusValue}>{formatDistance(currentDistance)}</Text>
          </View>
        )}

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Alert radius</Text>
          <Text style={styles.statusValue}>{formatDistance(destination.radius)}</Text>
        </View>

        <Text style={styles.reassurance}>
          {hasArrived
            ? 'You can stop the alarm now.'
            : 'You can close GeoWake — the alarm will still go off.'}
        </Text>

        {hasArrived ? (
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Stop the alarm"
          >
            <Text style={styles.dismissButtonText}>Stop alarm</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            accessibilityRole="button"
          >
            <Text style={styles.cancelButtonText}>Cancel alarm</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  centredText: { marginTop: spacing.md, color: colors.textMuted },
  blockedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  blockedBody: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  panel: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    elevation: 8,
  },
  destinationName: { fontSize: 22, fontWeight: 'bold', color: colors.primary },
  destinationAddress: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  statusLabel: { fontSize: 15, color: colors.textMuted },
  statusValue: { fontSize: 16, fontWeight: '600', color: colors.text },
  watching: { color: colors.accent },
  arrived: { color: colors.danger, fontSize: 20, fontWeight: 'bold' },
  reassurance: {
    marginTop: spacing.md,
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  // Deliberately far larger than the 48dp minimum. This is pressed by someone who has
  // just been woken up on a moving train.
  dismissButton: {
    marginTop: spacing.md,
    paddingVertical: 24,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  dismissButtonText: { color: colors.onPrimary, fontSize: 20, fontWeight: 'bold' },
  cancelButton: {
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
  },
  cancelButtonText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  secondaryButtonText: { color: colors.onPrimary, fontWeight: '600' },
});
