import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, Vibration } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';

const AlarmScreen = ({ route, navigation }) => {
  const { destination } = route.params;
  const [currentLocation, setCurrentLocation] = useState(null);
  const [distance, setDistance] = useState(null);
  const [alarmActive, setAlarmActive] = useState(true);
  const [alarmTriggered, setAlarmTriggered] = useState(false);
  const [backgroundTask, setBackgroundTask] = useState(null);
  const mapRef = useRef(null);
  
  // Start location tracking when component mounts
  useEffect(() => {
    let locationSubscription;
    
    const startLocationTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required for the alarm to work.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }
      
      // Request background location permission
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      
      if (backgroundStatus !== 'granted') {
        Alert.alert(
          'Background Permission Denied',
          'GeoWake works best with background location permissions. The alarm may not work when the app is in the background.',
          [{ text: 'Continue Anyway' }]
        );
      }
      
      // Start watching position
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10, // Update every 10 meters
          timeInterval: 5000,   // Or every 5 seconds
        },
        (location) => {
          const { latitude, longitude } = location.coords;
          const newCurrentLocation = { latitude, longitude };
          setCurrentLocation(newCurrentLocation);
          
          // Calculate distance to destination
          const calculatedDistance = calculateDistance(
            latitude,
            longitude,
            destination.latitude,
            destination.longitude
          );
          
          setDistance(calculatedDistance);
          
          // Check if we've reached the destination
          if (calculatedDistance <= destination.radius / 1000) { // Convert radius to km
            if (alarmActive && !alarmTriggered) {
              triggerAlarm();
            }
          }
        }
      );
    };
    
    startLocationTracking();
    
    // Register a background task for location tracking
    registerBackgroundTask();
    
    // Cleanup function
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
      
      if (backgroundTask) {
        Location.stopLocationUpdatesAsync(backgroundTask);
      }
    };
  }, []);
  
  // Register background task for location updates
  const registerBackgroundTask = async () => {
    try {
      // This is a simplified version - in a real app, you would need to implement
      // proper background tasks using expo-task-manager
      // For demonstration purposes, we're just showing the concept
      console.log('Background location tracking would be registered here');
    } catch (error) {
      console.error('Could not register background task:', error);
    }
  };
  
  // Calculate distance between two coordinates in kilometers
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
  };
  
  const deg2rad = (deg) => {
    return deg * (Math.PI / 180);
  };
  
  // Trigger the alarm when destination is reached
  const triggerAlarm = () => {
    setAlarmTriggered(true);
    
    // Vibrate pattern: wait 500ms, vibrate 500ms, wait 500ms, vibrate 500ms
    const PATTERN = [500, 1000, 500, 2000];
    
    // Vibrate with pattern
    Vibration.vibrate(PATTERN, true);
    
    // Show alert
    Alert.alert(
      'Destination Reached!',
      `You have arrived at ${destination.name}`,
      [
        {
          text: 'Stop Alarm',
          onPress: () => {
            Vibration.cancel();
            setAlarmActive(false);
          },
        },
      ],
      { cancelable: false }
    );
  };
  
  // Cancel the alarm
  const handleCancelAlarm = () => {
    Alert.alert(
      'Cancel Alarm',
      'Are you sure you want to cancel this alarm?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            setAlarmActive(false);
            if (alarmTriggered) {
              Vibration.cancel();
            }
            navigation.goBack();
          },
        },
      ]
    );
  };
  
  return (
    <View style={styles.container}>
      {/* Map View */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: destination.latitude,
          longitude: destination.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Destination marker and geofence */}
        <Marker
          coordinate={{
            latitude: destination.latitude,
            longitude: destination.longitude,
          }}
          title={destination.name}
          pinColor="red"
        />
        <Circle
          center={{
            latitude: destination.latitude,
            longitude: destination.longitude,
          }}
          radius={destination.radius}
          fillColor="rgba(16, 185, 129, 0.2)"
          strokeColor="rgba(16, 185, 129, 0.5)"
          strokeWidth={2}
        />
        
        {/* Current location marker */}
        {currentLocation && (
          <Marker
            coordinate={currentLocation}
            title="Your Location"
            pinColor="blue"
          />
        )}
      </MapView>
      
      {/* Alarm status panel */}
      <View style={styles.statusPanel}>
        <View style={styles.destinationInfo}>
          <Text style={styles.destinationName}>{destination.name}</Text>
          {destination.address && (
            <Text style={styles.destinationAddress}>{destination.address}</Text>
          )}
        </View>
        
        <View style={styles.statusInfo}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Status:</Text>
            <Text 
              style={[
                styles.statusValue, 
                alarmTriggered ? styles.triggered : alarmActive ? styles.active : styles.inactive
              ]}
            >
              {alarmTriggered ? 'ARRIVED!' : alarmActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
          
          {distance !== null && (
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Distance:</Text>
              <Text style={styles.statusValue}>
                {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(2)} km`}
              </Text>
            </View>
          )}
          
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Alarm Radius:</Text>
            <Text style={styles.statusValue}>{destination.radius} m</Text>
          </View>
        </View>
        
        <TouchableOpacity 
          style={styles.cancelButton}
          onPress={handleCancelAlarm}
        >
          <Text style={styles.buttonText}>Cancel Alarm</Text>
        </TouchableOpacity>
      </View>
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
  statusPanel: {
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
  destinationInfo: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 15,
  },
  destinationName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E3A8A',
    marginBottom: 5,
  },
  destinationAddress: {
    fontSize: 14,
    color: '#666',
  },
  statusInfo: {
    marginBottom: 20,
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  active: {
    color: '#10B981', // Green
  },
  inactive: {
    color: '#666', // Gray
  },
  triggered: {
    color: '#F59E0B', // Orange
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#ef4444', // Red
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AlarmScreen;
