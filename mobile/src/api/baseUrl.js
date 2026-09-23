import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const getBackendUrl = () => {
  // 1. Explicit env override — must point to the BACKEND server (port 8080), NOT Expo bundler
  if (process.env.EXPO_PUBLIC_API_URL) {
    const url = process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
    console.log('[API] BASE_URL from EXPO_PUBLIC_API_URL:', url);
    return url;
  }

  // 2. app.json extra.apiUrl — same requirement: must be the backend URL
  if (Constants.expoConfig?.extra?.apiUrl) {
    const url = Constants.expoConfig.extra.apiUrl.replace(/\/$/, '');
    console.log('[API] BASE_URL from app.json extra.apiUrl:', url);
    return url;
  }

  // 3. Auto-detect: if running in Expo Go, infer backend from the bundler host IP
  //    Expo's hostUri is like "192.168.1.4:8081" — we take the IP and append :8080
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    const url = `http://${ip}:8080`;
    console.log('[API] BASE_URL auto-detected from hostUri:', url);
    return url;
  }

  // 4. Emulator fallback
  const url = Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://localhost:8080';
  console.log('[API] BASE_URL fallback:', url);
  return url;
};

export const BASE_URL = getBackendUrl();
