import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Switch, TouchableOpacity, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const SettingsScreen = () => {
  const [backgroundLocationEnabled, setBackgroundLocationEnabled] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [savedLocations, setSavedLocations] = useState([]);

  useEffect(() => {
    // Load settings from storage
    loadSettings();
    // Load saved locations
    loadSavedLocations();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await AsyncStorage.getItem('settings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        setVibrationEnabled(parsedSettings.vibrationEnabled ?? true);
        setSoundEnabled(parsedSettings.soundEnabled ?? true);
      }

      // Check background location permission status
      const { status } = await Location.getBackgroundPermissionsAsync();
      setBackgroundLocationEnabled(status === 'granted');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

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

  const saveSettings = async () => {
    try {
      const settings = {
        vibrationEnabled,
        soundEnabled,
      };
      await AsyncStorage.setItem('settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const toggleBackgroundLocation = async () => {
    if (!backgroundLocationEnabled) {
      // Request background location permission
      const { status } = await Location.requestBackgroundPermissionsAsync();
      setBackgroundLocationEnabled(status === 'granted');
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Background location permission is required for the alarm to work when the app is in the background.'
        );
      }
    } else {
      Alert.alert(
        'Permission Info',
        'To disable background location, you need to go to your device settings and revoke the permission for GeoWake.'
      );
    }
  };

  const toggleVibration = () => {
    const newValue = !vibrationEnabled;
    setVibrationEnabled(newValue);
    saveSettings();
  };

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    saveSettings();
  };

  const handleDeleteLocation = (locationId) => {
    Alert.alert(
      'Delete Location',
      'Are you sure you want to delete this saved location?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedLocations = savedLocations.filter(loc => loc.id !== locationId);
              setSavedLocations(updatedLocations);
              await AsyncStorage.setItem('savedLocations', JSON.stringify(updatedLocations));
            } catch (error) {
              console.error('Failed to delete location:', error);
              Alert.alert('Error', 'Failed to delete location');
            }
          } 
        },
      ]
    );
  };

  const handleClearAllLocations = () => {
    Alert.alert(
      'Clear All Locations',
      'Are you sure you want to delete all saved locations? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: async () => {
            try {
              setSavedLocations([]);
              await AsyncStorage.removeItem('savedLocations');
              Alert.alert('Success', 'All saved locations have been cleared');
            } catch (error) {
              console.error('Failed to clear locations:', error);
              Alert.alert('Error', 'Failed to clear locations');
            }
          } 
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Vibration</Text>
          <Switch
            value={vibrationEnabled}
            onValueChange={toggleVibration}
            trackColor={{ false: '#767577', true: '#10B981' }}
            thumbColor={vibrationEnabled ? '#f4f3f4' : '#f4f3f4'}
          />
        </View>
        
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Sound</Text>
          <Switch
            value={soundEnabled}
            onValueChange={toggleSound}
            trackColor={{ false: '#767577', true: '#10B981' }}
            thumbColor={soundEnabled ? '#f4f3f4' : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Background Location</Text>
          <Switch
            value={backgroundLocationEnabled}
            onValueChange={toggleBackgroundLocation}
            trackColor={{ false: '#767577', true: '#10B981' }}
            thumbColor={backgroundLocationEnabled ? '#f4f3f4' : '#f4f3f4'}
          />
        </View>
        
        <Text style={styles.permissionNote}>
          Background location is required for the alarm to work when the app is in the background or your device is locked.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved Locations ({savedLocations.length})</Text>
        
        {savedLocations.length > 0 ? (
          savedLocations.map(location => (
            <View key={location.id} style={styles.locationItem}>
              <View style={styles.locationInfo}>
                <Text style={styles.locationName}>{location.name}</Text>
                {location.address && (
                  <Text style={styles.locationAddress}>{location.address}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteLocation(location.id)}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.noLocationsText}>No saved locations</Text>
        )}
        
        {savedLocations.length > 0 && (
          <TouchableOpacity 
            style={styles.clearAllButton}
            onPress={handleClearAllLocations}
          >
            <Text style={styles.clearAllButtonText}>Clear All Locations</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.aboutText}>
          GeoWake v1.0.0{"\n"}
          A location-based alarm app for travelers.{"\n"}
          Never miss your stop again!
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  section: {
    backgroundColor: 'white',
    marginVertical: 10,
    marginHorizontal: 15,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E3A8A',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  permissionNote: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 10,
  },
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  locationAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  deleteButton: {
    backgroundColor: '#ff4d4f',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  noLocationsText: {
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 15,
  },
  clearAllButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 15,
  },
  clearAllButtonText: {
    color: '#ff4d4f',
    fontSize: 16,
    fontWeight: '500',
  },
  aboutText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

export default SettingsScreen;
