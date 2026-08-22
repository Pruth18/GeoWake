import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  findNodeHandle,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { colors, mapOverlay, radii, spacing, MIN_TOUCH_TARGET } from '../theme';
import { distanceMeters, formatDistance } from '../lib/geo';
import { armAlarm, disarmAlarm, dismissAlarm } from '../services/geofence';
import { stopAlarmDelivery } from '../services/alarm/delivery';
import { blockersForArming, requestAlarmPermissions } from '../services/permissions';
import { loadAlarmState } from '../services/storage';
import type { AlarmState } from '../types';
import type { RootStackScreenProps } from '../navigation/types';

/**
 * How often the screen re-reads persisted alarm state.
 *
 * Arrival is decided by the geofence task, which may run while this screen is not even
 * mounted. Storage is the only channel between that headless process and the UI, so the
 * screen polls rather than owning any detection logic of its own.
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
  const dismissRef = useRef<View>(null);
  const announcedRef = useRef(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const existing = await loadAlarmState();
      if (!active) return;
      setAlarmState(existing);

      /**
       * Reaching this screen from a notification tap means the alarm is ALREADY
       * sounding. Arming again would put a spinner — and possibly a permission dialog —
       * between a half-awake user and the only control they need, and would overwrite
       * `triggered` with `armed`, which silently destroys the arrival record, prevents
       * dismissAlarm from working, and re-registers a fence for a place the user is
       * currently standing inside.
       */
      if (existing.status === 'triggered') {
        setPhase('ready');
        return;
      }

      let permissions;
      try {
        permissions = await requestAlarmPermissions();
      } catch (error) {
        if (!active) return;
        // Previously outside the try block, so a rejection left the screen stuck on
        // "Setting up your alarm…" forever with nothing logged.
        setBlockedReason(
          error instanceof Error ? error.message : 'Could not check location permissions.'
        );
        setPhase('failed');
        return;
      }

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

  const hasArrived = alarmState?.status === 'triggered';

  useEffect(() => {
    if (!hasArrived || phase !== 'ready' || announcedRef.current) return;
    announcedRef.current = true;

    /**
     * Two mechanisms, because neither alone covers the real path.
     *
     * accessibilityLiveRegion announces on CHANGE, not on mount — and the notification
     * tap mounts this screen with hasArrived already true, so the live region is silent
     * in exactly the scenario the app exists for. announceForAccessibility fires on a
     * cold mount. setAccessibilityFocus then lands the reader on the stop control
     * instead of making it swipe past an entire MapView to reach it.
     */
    AccessibilityInfo.announceForAccessibility(
      `Arrived at ${destination.name}. Stop alarm button.`
    );
    const handle = findNodeHandle(dismissRef.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [hasArrived, phase, destination.name]);

  const handleCancel = useCallback(() => {
    // Deliberately never says "Stop alarm" — that phrase belongs only to the control
    // that silences a ringing alarm. Using it for both invites a half-asleep user to
    // press the wrong one from muscle memory.
    Alert.alert('Stop watching?', `GeoWake will no longer wake you at ${destination.name}.`, [
      { text: 'Keep watching', style: 'cancel' },
      {
        text: 'Yes, stop watching',
        style: 'destructive',
        onPress: async () => {
          await stopAlarmDelivery('user-cancelled');
          await disarmAlarm('user-cancelled');
          navigation.goBack();
        },
      },
    ]);
  }, [destination.name, navigation]);

  const handleDismiss = useCallback(async () => {
    // Silence first, record second: the user pressed stop, so the noise must end
    // immediately even if writing state is slow.
    await stopAlarmDelivery('user-dismissed');
    await dismissAlarm();
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
        <Text style={styles.blockedTitle} accessibilityRole="header">
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
        // While the alarm is sounding the map is decoration. Removing it from the
        // accessibility tree cuts the swipe distance to the stop control from roughly
        // eight elements to one.
        importantForAccessibility={hasArrived ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={hasArrived}
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
        {/*
          Rendered FIRST while ringing, and outside the ScrollView, so scaled text can
          never push it below the fold. It was previously the last child of a
          non-scrolling panel — at the largest Android font size the panel overflows and
          the part that goes off-screen is whatever is last, i.e. this button.
        */}
        {hasArrived && (
          <TouchableOpacity
            ref={dismissRef}
            style={styles.dismissButton}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel={`Stop the alarm for ${destination.name}`}
          >
            {/* Capped so the button itself stays on screen; everything else scales freely. */}
            <Text style={styles.dismissButtonText} maxFontSizeMultiplier={1.6}>
              Stop alarm
            </Text>
          </TouchableOpacity>
        )}

        <ScrollView style={styles.details} contentContainerStyle={styles.detailsContent}>
          <Text style={styles.destinationName} accessibilityRole="header">
            {destination.name}
          </Text>
          {destination.address ? (
            <Text style={styles.destinationAddress}>{destination.address}</Text>
          ) : null}

          <View
            style={styles.statusRow}
            accessible
            accessibilityLabel={
              hasArrived ? `Status: arrived at ${destination.name}` : 'Status: watching'
            }
            /*
              Assertive, not polite. Polite queues behind current speech and is dropped
              while the user is interacting — the right trade for a toast, the wrong one
              for an alarm. This node changes exactly once and never back; the distance
              readout below is deliberately NOT a live region, which is what keeps
              assertive from becoming spam.
            */
            accessibilityLiveRegion="assertive"
          >
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={[styles.statusValue, hasArrived ? styles.arrived : styles.watching]}>
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
        </ScrollView>

        {!hasArrived && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel={`Stop watching for ${destination.name}`}
          >
            <Text style={styles.cancelButtonText}>Stop watching</Text>
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
  // No fixed lineHeight: it does not scale with the user's font setting, so at large
  // sizes the glyphs outgrow the line box and overlap. This is the permissions-failure
  // explanation, so it has to stay readable.
  blockedBody: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  panel: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    elevation: 8,
    // Bounded so the map never collapses entirely at large font sizes.
    maxHeight: '75%',
  },
  details: { flexShrink: 1 },
  detailsContent: { paddingBottom: spacing.sm },
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
    marginBottom: spacing.md,
    paddingVertical: 24,
    minHeight: MIN_TOUCH_TARGET * 1.5,
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  dismissButtonText: { color: colors.onPrimary, fontSize: 20, fontWeight: 'bold' },
  cancelButton: {
    marginTop: spacing.md,
    paddingVertical: 14,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
  },
  cancelButtonText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    paddingVertical: 12,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  secondaryButtonText: { color: colors.onPrimary, fontWeight: '600' },
});
