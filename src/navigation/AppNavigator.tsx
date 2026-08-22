import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import AlarmScreen from '../screens/AlarmScreen';
import DebugScreen from '../screens/DebugScreen';
import HomeScreen from '../screens/HomeScreen';
import MapScreen from '../screens/MapScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { devToolsEnabled } from '../config';
import { colors } from '../theme';
import { navigationRef } from './navigationRef';
import type { RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.onPrimary,
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'GeoWake' }} />
        <Stack.Screen name="Map" component={MapScreen} options={{ title: 'Select Destination' }} />
        <Stack.Screen name="Alarm" component={AlarmScreen} options={{ title: 'Active Alarm' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        {devToolsEnabled && (
          <Stack.Screen name="Debug" component={DebugScreen} options={{ title: 'Debug tools' }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
