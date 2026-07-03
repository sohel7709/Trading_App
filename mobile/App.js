import React, { useState, useMemo, useEffect } from 'react';
import { View, ActivityIndicator, LogBox } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import { AuthContext } from './src/context/AuthContext';
import NotificationBridge from './src/components/NotificationBridge';
import ErrorBoundary from './src/components/ErrorBoundary';

// expo-notifications logs this on every load when running in Expo Go on
// SDK 53+, because remote push was dropped from Expo Go — it does not affect
// the local (in-app) notifications this app actually uses, so it's just
// noise here rather than a real error.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
]);

const SESSION_KEY = 'session_active';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  // Restoring the persisted session takes one tick — until then, don't flash
  // the login screen for a user who's actually still signed in.
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then(v => { if (v === '1') setLoggedIn(true); })
      .catch(e => console.warn('[Session] restore failed:', e.message))
      .finally(() => setRestoring(false));
  }, []);

  const auth = useMemo(() => ({
    logout: () => {
      setLoggedIn(false);
      AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
    },
  }), []);

  // Persist the session flag *before* flipping into the logged-in UI. The
  // previous version set state first and fired the AsyncStorage write in the
  // background — if the OS backgrounds/kills the app in that window (common
  // on Android under memory pressure) before the write lands, the app looks
  // logged in but nothing was ever saved to disk. The very next cold start
  // reads a missing/stale flag and drops the user back on the login screen,
  // which reads as a random, unprompted logout.
  const handleLogin = async () => {
    try {
      await AsyncStorage.setItem(SESSION_KEY, '1');
    } catch (e) {
      console.warn('[Session] persist failed:', e.message);
    }
    setLoggedIn(true);
  };

  if (restoring) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
          <ActivityIndicator color="#387ED1" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <ErrorBoundary>
        {loggedIn ? (
          <AuthContext.Provider value={auth}>
            <NotificationBridge />
            <NavigationContainer>
              <AppNavigator />
            </NavigationContainer>
          </AuthContext.Provider>
        ) : (
          <LoginScreen onLogin={handleLogin} />
        )}
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
