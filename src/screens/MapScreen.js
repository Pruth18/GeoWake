import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, Alert } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MapScreen = ({ navigation }) => {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [radius, setRadius] = useState(500); // Default radius in meters
  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Permission to access location was denied. GeoWake needs location access to function properly.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        const { latitude, longitude } = location.coords;
        setCurrentLocation({ latitude, longitude });
        
        // Animate to current location
        mapRef.current?.animateToRegion({
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      } catch (error) {
        console.error('Error getting current location:', error);
        Alert.alert('Error', 'Failed to get your current location');
      }
    })();
  }, []);

  const handleMapPress = (event) => {
    const { coordinate } = event.nativeEvent;
    setSelectedLocation(coordinate);
  };

  const saveLocation = async () => {
    if (!selectedLocation) {
      Alert.alert('Error', 'Please select a location on the map');
      return;
    }

    if (!locationName.trim()) {
      Alert.alert('Error', 'Please enter a name for this location');
      return;
    }

    try {
      // Get address from coordinates (reverse geocoding)
      const [address] = await Location.reverseGeocodeAsync(selectedLocation);
      const addressStr = [
        address.street,
        address.city,
        address.region,
        address.country
      ].filter(Boolean).join(', ');

      const newLocation = {
        id: Date.now().toString(),
        name: locationName,
        address: addressStr,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        radius: radius,
      };

      // Save to AsyncStorage
      const savedLocationsJson = await AsyncStorage.getItem('savedLocations');
      const savedLocations = savedLocationsJson ? JSON.parse(savedLocationsJson) : [];
      savedLocations.push(newLocation);
      await AsyncStorage.setItem('savedLocations', JSON.stringify(savedLocations));

      // Navigate to alarm screen with the new location
      navigation.navigate('Alarm', { destination: newLocation });
    } catch (error) {
      console.error('Error saving location:', error);
      Alert.alert('Error', 'Failed to save location');
    }
  };

  const handleSetAlarmWithoutSaving = () => {
    if (!selectedLocation) {
      Alert.alert('Error', 'Please select a location on the map');
      return;
    }

    const tempDestination = {
      id: 'temp-' + Date.now().toString(),
      name: locationName || 'Selected Location',
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      radius: radius,
    };

    navigation.navigate('Alarm', { destination: tempDestination });
  };

  return (
    <View style={styles.container}>
      {currentLocation ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          onPress={handleMapPress}
        >
          {/* Current location marker */}
          <Marker
            coordinate={currentLocation}
            title="Your Location"
            pinColor="blue"
          />

          {/* Selected destination marker and geofence circle */}
          {selectedLocation && (
            <>
              <Marker
                coordinate={selectedLocation}
                title={locationName || "Selected Destination"}
                pinColor="red"
              />
              <Circle
                center={selectedLocation}
                radius={radius}
                fillColor="rgba(16, 185, 129, 0.2)"
                strokeColor="rgba(16, 185, 129, 0.5)"
                strokeWidth={2}
              />
            </>
          )}
        </MapView>
      ) : (
        <View style={styles.loadingContainer}>
          <Text>Loading map...</Text>
        </View>
      )}

      {selectedLocation && (
        <View style={styles.destinationPanel}>
          <TextInput
            style={styles.input}
            placeholder="Location Name"
            value={locationName}
            onChangeText={setLocationName}
          />
          
          <View style={styles.radiusContainer}>
            <Text style={styles.radiusLabel}>Alert Radius: {radius}m</Text>
            <View style={styles.radiusButtonsContainer}>
              <TouchableOpacity 
                style={[styles.radiusButton, radius === 200 && styles.radiusButtonActive]}
                onPress={() => setRadius(200)}
              >
                <Text style={styles.radiusButtonText}>200m</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.radiusButton, radius === 500 && styles.radiusButtonActive]}
                onPress={() => setRadius(500)}
              >
                <Text style={styles.radiusButtonText}>500m</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.radiusButton, radius === 1000 && styles.radiusButtonActive]}
                onPress={() => setRadius(1000)}
              >
                <Text style={styles.radiusButtonText}>1km</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.saveButton}
              onPress={saveLocation}
            >
              <Text style={styles.buttonText}>Save & Set Alarm</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.setAlarmButton}
              onPress={handleSetAlarmWithoutSaving}
            >
              <Text style={styles.buttonText}>Set Alarm Only</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  destinationPanel: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
  },
  radiusContainer: {
    marginBottom: 15,
  },
  radiusLabel: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  radiusButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  radiusButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  radiusButtonActive: {
    backgroundColor: '#1E3A8A',
  },
  radiusButtonText: {
    color: '#333',
    fontWeight: '500',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  saveButton: {
    backgroundColor: '#10B981', // Vibrant Green from your color scheme
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  setAlarmButton: {
    backgroundColor: '#F59E0B', // Warm Orange from your color scheme
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default MapScreen;
