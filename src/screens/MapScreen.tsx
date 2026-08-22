import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Circle, Marker, type LatLng } from 'react-native-maps';

import { colors, mapOverlay, radii, spacing, MIN_TOUCH_TARGET } from '../theme';
import { formatDistance } from '../lib/geo';
import { addDestination } from '../services/storage';
import {
  DEFAULT_RADIUS_M,
  RADIUS_NOTE,
  RADIUS_OPTIONS_M,
  type Destination,
} from '../types';
import type { RootStackScreenProps } from '../navigation/types';

const INITIAL_DELTA = 0.01;

export default function MapScreen({ navigation }: RootStackScreenProps<'Map'>) {
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [selected, setSelected] = useState<LatLng | null>(null);
  const [name, setName] = useState('');
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS_M);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) return;

      if (status !== 'granted') {
        Alert.alert(
          'Permission denied',
          'GeoWake needs location access to show the map and set a destination.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;

        const coords: LatLng = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setCurrentLocation(coords);
        mapRef.current?.animateToRegion({
          ...coords,
          latitudeDelta: INITIAL_DELTA,
          longitudeDelta: INITIAL_DELTA,
        });
      } catch {
        if (!active) return;
        Alert.alert('Could not get your location', 'Check that location services are on.');
      }
    })();

    return () => {
      active = false;
    };
  }, [navigation]);

  /**
   * Reverse geocoding is a nicety, not a requirement — a failure here must not stop
   * someone setting an alarm. The MVP let it throw and reported "Failed to save
   * location", which was both wrong and unhelpful.
   */
  const describe = async (coords: LatLng): Promise<string | undefined> => {
    try {
      const [address] = await Location.reverseGeocodeAsync(coords);
      if (!address) return undefined;
      const parts = [address.street, address.city, address.region, address.country];
      const label = parts.filter(Boolean).join(', ');
      return label.length > 0 ? label : undefined;
    } catch {
      return undefined;
    }
  };

  const buildDestination = async (persist: boolean): Promise<Destination | null> => {
    if (!selected) {
      Alert.alert('Pick a destination', 'Tap the map to choose where you want to be woken.');
      return null;
    }
    if (persist && name.trim().length === 0) {
      Alert.alert('Name this place', 'Give the location a name so you can find it again.');
      return null;
    }

    const destination: Destination = {
      id: `${Date.now()}`,
      name: name.trim().length > 0 ? name.trim() : 'Selected location',
      address: await describe(selected),
      latitude: selected.latitude,
      longitude: selected.longitude,
      radius,
      createdAt: Date.now(),
    };

    if (persist) await addDestination(destination);
    return destination;
  };

  const handleContinue = async (persist: boolean) => {
    setSaving(true);
    try {
      const destination = await buildDestination(persist);
      if (destination) navigation.navigate('Alarm', { destination });
    } finally {
      setSaving(false);
    }
  };

  if (!currentLocation) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Finding your location…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          ...currentLocation,
          latitudeDelta: INITIAL_DELTA,
          longitudeDelta: INITIAL_DELTA,
        }}
        showsUserLocation
        onPress={(event) => setSelected(event.nativeEvent.coordinate)}
      >
        {selected && (
          <>
            <Marker coordinate={selected} title={name || 'Destination'} pinColor="red" />
            <Circle
              center={selected}
              radius={radius}
              fillColor={mapOverlay.fill}
              strokeColor={mapOverlay.stroke}
              strokeWidth={mapOverlay.strokeWidth}
            />
          </>
        )}
      </MapView>

      {selected && (
        <View style={styles.panel}>
          <TextInput
            style={styles.input}
            placeholder="Location name"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            accessibilityLabel="Location name"
          />

          <Text style={styles.radiusLabel}>Alert radius: {formatDistance(radius)}</Text>
          <View
            style={styles.radiusRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="Alert radius"
          >
            {RADIUS_OPTIONS_M.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.radiusButton, radius === option && styles.radiusButtonActive]}
                onPress={() => setRadius(option)}
                /*
                  radio + checked maps to RadioButton/setChecked, which TalkBack
                  announces reliably. button + selected maps to setSelected, which it
                  has never announced consistently.
                */
                accessibilityRole="radio"
                accessibilityState={{ checked: radius === option }}
                accessibilityLabel={`${formatDistance(option)} radius`}
                // Attaches the reliability caveat to the option it applies to, rather
                // than leaving it in a detached Text a screen reader never reaches.
                accessibilityHint={RADIUS_NOTE[option]}
              >
                <Text
                  style={[styles.radiusText, radius === option && styles.radiusTextActive]}
                >
                  {radius === option ? `✓ ${formatDistance(option)}` : formatDistance(option)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {RADIUS_NOTE[radius] ? <Text style={styles.radiusNote}>{RADIUS_NOTE[radius]}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.saveButton, saving && styles.buttonDisabled]}
              onPress={() => handleContinue(true)}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Save &amp; set alarm</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.onceButton, saving && styles.buttonDisabled]}
              onPress={() => handleContinue(false)}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Just this once</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: { marginTop: spacing.md, color: colors.textMuted },
  panel: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    elevation: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: MIN_TOUCH_TARGET,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.md,
  },
  radiusLabel: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  radiusRow: { flexDirection: 'row', gap: spacing.sm },
  radiusButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radii.sm,
    // Border width lives on the base style so selecting an option does not reflow the
    // row, and so selection reads as fill + checkmark + border colour, not fill alone.
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  radiusButtonActive: { backgroundColor: colors.accent, borderColor: colors.primary },
  radiusText: { color: colors.textMuted, fontWeight: '600' },
  radiusTextActive: { color: colors.onAccent },
  radiusNote: { marginTop: spacing.sm, fontSize: 12, color: colors.warning },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  button: {
    flex: 1,
    paddingVertical: 14,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: radii.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  saveButton: { backgroundColor: colors.accent },
  onceButton: { backgroundColor: colors.primary },
  buttonText: { color: colors.onPrimary, fontWeight: 'bold', fontSize: 15 },
});
