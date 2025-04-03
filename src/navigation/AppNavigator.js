import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import MapScreen from '../screens/MapScreen';
import AlarmScreen from '../screens/AlarmScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createStackNavigator();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1E3A8A', // Deep Blue from your color scheme
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'GeoWake' }} 
        />
        <Stack.Screen 
          name="Map" 
          component={MapScreen} 
          options={{ title: 'Select Destination' }} 
        />
        <Stack.Screen 
          name="Alarm" 
          component={AlarmScreen} 
          options={{ title: 'Active Alarm' }} 
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen} 
          options={{ title: 'Settings' }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
