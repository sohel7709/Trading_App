import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ActivityIndicator, LogBox } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import { AuthContext } from './src/context/AuthContext';
import NotificationBridge from './src/components/NotificationBridge';
import ErrorBoundary from './src/components/ErrorBoundary';
import { getAccessToken, getStoredUser, login } from './src/services/authService';
import { BASE_URL } from './src/api/client';
import SocketClient from './src/socket/socketClient';

LogBox.ignoreLogs([
  'expo-notifications',
  'Android Push notifications',
  'remote notifications',
  'Require cycle:',
  'Require cycles are allowed',
]);

const SESSION_KEY    = 'session_active';
const REMEMBER_KEY   = 'saved_credentials';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  // Restoring the persisted session takes one tick — until then, don't flash
  // the login screen for a user who's actually still signed in.
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sessionActive = await AsyncStorage.getItem(SESSION_KEY);
        if (sessionActive === '1') {
          // Session flag exists. Try to re-validate with the server by checking
          // the stored access token via /auth/me — if it's still alive, skip login.
          // If it's expired, try to auto-login with saved credentials (Remember Me).
          const token = await getAccessToken();

          if (token) {
            const res = await fetch(`${BASE_URL}/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              if (data.user) setUser(data.user);
              // Connect socket with valid token for real-time updates
              SocketClient.connect(token);
              setLoggedIn(true);
              return;
            }
          }

          // Token invalid/missing — try auto-login with saved credentials
          const raw = await AsyncStorage.getItem(REMEMBER_KEY);
          if (raw) {
            const { instituteCode, userId, password } = JSON.parse(raw);
            const data = await login(userId, password, instituteCode);
            if (data?.user) setUser(data.user);
            // Connect socket with fresh token
            const freshToken = await getAccessToken();
            if (freshToken) SocketClient.connect(freshToken);
            setLoggedIn(true);
            return;
          }
        }
      } catch (e) {
        console.warn('[Session] restore failed:', e.message);
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const auth = useMemo(() => ({
    user,
    setUser,
    logout: () => {
      SocketClient.disconnect();
      setLoggedIn(false);
      setUser(null);
      AsyncStorage.multiRemove([SESSION_KEY]).catch(() => {});
      // Note: we do NOT remove REMEMBER_KEY on logout so credentials remain
      // saved if the user had Remember Me on — they can just tap Sign In again.
    },
  }), [user]);

  // Persist the session flag *before* flipping into the logged-in UI.
  const handleLogin = async (userData) => {
    try {
      await AsyncStorage.setItem(SESSION_KEY, '1');
      if (userData) {
        setUser(userData);
      } else {
        const stored = await getStoredUser();
        if (stored) setUser(stored);
      }
      // Connect socket with JWT so real-time events (orderExecuted, walletUpdated, etc.) work
      const token = await getAccessToken();
      if (token) {
        SocketClient.connect(token);
        console.log('[App] SocketClient connected after login');
      }
    } catch (e) {
      console.warn('[Session] persist failed:', e.message);
    }
    setLoggedIn(true);
  };


  if (restoring) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 24 }}>
          {/* Logo badge */}
          <View style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            backgroundColor: '#1A73E8',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 20,
            shadowColor: '#1A73E8',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 6,
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '800' }}>T</Text>
          </View>
          
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5, marginBottom: 4 }}>
            Trade Lab
          </Text>
          <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500', marginBottom: 32 }}>
            Paper Trading Platform
          </Text>

          <ActivityIndicator size="small" color="#1A73E8" />
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
