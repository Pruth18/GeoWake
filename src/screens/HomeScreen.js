import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, FlatList, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const HomeScreen = ({ navigation }) => {
  const [savedLocations, setSavedLocations] = useState([]);
  const [locationPermission, setLocationPermission] = useState(null);

  useEffect(() => {
    // Request location permissions when component mounts
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'GeoWake needs location permissions to function properly. Please enable location services in your settings.',
          [{ text: 'OK' }]
        );
      }
    })();

    // Load saved locations from storage
    loadSavedLocations();
  }, []);

  const loadSavedLocations = async () => {
    try {
      const savedLocationsJson = await AsyncStorage.getItem('savedLocations');
      if (savedLocationsJson) {
        setSavedLocations(JSON.parse(savedLocationsJson));
      }
    } catch (error) {
      console.error('Failed to load saved locations:', error);
    }
  };

  const handleSetNewAlarm = () => {
    if (!locationPermission) {
      Alert.alert(
        'Location Permission Required',
        'Please enable location permissions to set an alarm',
        [{ text: 'OK' }]
      );
      return;
    }
    navigation.navigate('Map');
  };

  const handleSelectSavedLocation = (location) => {
    navigation.navigate('Alarm', { destination: location });
  };

  const renderSavedLocation = ({ item }) => (
    <TouchableOpacity 
      style={styles.savedLocationItem}
      onPress={() => handleSelectSavedLocation(item)}
    >
      <Text style={styles.locationName}>{item.name}</Text>
      <Text style={styles.locationAddress}>{item.address}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome to GeoWake</Text>
        <Text style={styles.subtitle}>Never miss your stop again</Text>
      </View>

      <TouchableOpacity 
        style={styles.newAlarmButton}
        onPress={handleSetNewAlarm}
      >
        <Text style={styles.buttonText}>Set New Alarm</Text>
      </TouchableOpacity>

      <View style={styles.savedLocationsContainer}>
        <Text style={styles.sectionTitle}>Saved Locations</Text>
        {savedLocations.length > 0 ? (
          <FlatList
            data={savedLocations}
            renderItem={renderSavedLocation}
            keyExtractor={(item) => item.id}
            style={styles.savedLocationsList}
          />
        ) : (
          <Text style={styles.noLocationsText}>No saved locations yet</Text>
        )}
      </View>

      <TouchableOpacity 
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={styles.buttonText}>Settings</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f7',
  },
  header: {
    marginTop: 20,
    marginBottom: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E3A8A', // Deep Blue from your color scheme
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  newAlarmButton: {
    backgroundColor: '#10B981', // Vibrant Green from your color scheme
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 25,
    elevation: 2,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  savedLocationsContainer: {
    flex: 1,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  savedLocationsList: {
    flex: 1,
  },
  savedLocationItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    elevation: 1,
  },
  locationName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E3A8A',
    marginBottom: 5,
  },
  locationAddress: {
    fontSize: 14,
    color: '#666',
  },
  noLocationsText: {
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
  },
  settingsButton: {
    backgroundColor: '#666',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});

export default HomeScreen;
