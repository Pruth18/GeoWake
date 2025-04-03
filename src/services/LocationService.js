import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

class LocationService {
  constructor() {
    this.locationSubscription = null;
    this.activeAlarms = [];
    this.onAlarmTrigger = null;
  }

  // Request location permissions
  async requestPermissions() {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    let backgroundStatus = { status: 'denied' };
    
    if (foregroundStatus === 'granted') {
      backgroundStatus = await Location.requestBackgroundPermissionsAsync();
    }
    
    return {
      foreground: foregroundStatus === 'granted',
      background: backgroundStatus.status === 'granted',
    };
  }

  // Check if location permissions are granted
  async checkPermissions() {
    const foreground = await Location.getForegroundPermissionsAsync();
    const background = await Location.getBackgroundPermissionsAsync();
    
    return {
      foreground: foreground.status === 'granted',
      background: background.status === 'granted',
    };
  }

  // Get current location
  async getCurrentLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        throw new Error('Location permission not granted');
      }
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      throw error;
    }
  }

  // Start tracking location and monitoring for alarms
  async startLocationTracking(onLocationUpdate, onAlarmTrigger) {
    try {
      // Store callback for alarm triggers
      this.onAlarmTrigger = onAlarmTrigger;
      
      // Check if we already have a subscription
      if (this.locationSubscription) {
        await this.locationSubscription.remove();
      }
      
      // Start watching position
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10, // Update every 10 meters
          timeInterval: 5000,   // Or every 5 seconds
        },
        (location) => {
          const { latitude, longitude } = location.coords;
          const currentLocation = { latitude, longitude };
          
          // Call the location update callback
          if (onLocationUpdate) {
            onLocationUpdate(currentLocation);
          }
          
          // Check active alarms
          this.checkAlarms(currentLocation);
        }
      );
      
      return true;
    } catch (error) {
      console.error('Error starting location tracking:', error);
      return false;
    }
  }

  // Stop location tracking
  async stopLocationTracking() {
    if (this.locationSubscription) {
      await this.locationSubscription.remove();
      this.locationSubscription = null;
    }
  }

  // Add an alarm to monitor
  addAlarm(alarm) {
    // Generate ID if not provided
    if (!alarm.id) {
      alarm.id = Date.now().toString();
    }
    
    // Add to active alarms
    this.activeAlarms.push(alarm);
    return alarm.id;
  }

  // Remove an alarm
  removeAlarm(alarmId) {
    this.activeAlarms = this.activeAlarms.filter(alarm => alarm.id !== alarmId);
  }

  // Clear all alarms
  clearAlarms() {
    this.activeAlarms = [];
  }

  // Check if any alarms should be triggered based on current location
  checkAlarms(currentLocation) {
    this.activeAlarms.forEach(alarm => {
      if (alarm.triggered) return;
      
      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        alarm.latitude,
        alarm.longitude
      );
      
      // Convert radius from meters to kilometers for comparison
      if (distance <= alarm.radius / 1000) {
        // Mark as triggered
        alarm.triggered = true;
        
        // Call the trigger callback if provided
        if (this.onAlarmTrigger) {
          this.onAlarmTrigger(alarm);
        }
      }
    });
  }

  // Calculate distance between two coordinates in kilometers
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
  }

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // Get reverse geocoding (address from coordinates)
  async getAddressFromCoordinates(latitude, longitude) {
    try {
      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
      return address;
    } catch (error) {
      console.error('Error getting address:', error);
      return null;
    }
  }
}

// Create a singleton instance
const locationService = new LocationService();
export default locationService;
