import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../api/baseUrl';

const KEYS = {
  accessToken: 'auth_access_token',
  refreshToken: 'auth_refresh_token',
  user: 'auth_user',
};

// ── Store / retrieve tokens ───────────────────────────────────────────────────

export const storeTokens = async (accessToken, refreshToken, user) => {
  await AsyncStorage.multiSet([
    [KEYS.accessToken, accessToken],
    [KEYS.refreshToken, refreshToken],
    [KEYS.user, JSON.stringify(user)],
  ]);
};

export const getAccessToken = () => AsyncStorage.getItem(KEYS.accessToken);
export const getRefreshToken = () => AsyncStorage.getItem(KEYS.refreshToken);
export const getStoredUser = async () => {
  const raw = await AsyncStorage.getItem(KEYS.user);
  return raw ? JSON.parse(raw) : null;
};
export const setStoredUser = (user) => AsyncStorage.setItem(KEYS.user, JSON.stringify(user));


export const clearTokens = () =>
  AsyncStorage.multiRemove([KEYS.accessToken, KEYS.refreshToken, KEYS.user]);

// ── Login ─────────────────────────────────────────────────────────────────────

export const login = async (userId, password, instituteCode = '') => {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password, instituteCode }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Server returned an invalid response (not JSON). Please check API URL.');
  }

  if (!res.ok) throw new Error(data.message || 'Login failed');

  await storeTokens(data.accessToken, data.refreshToken, data.user);
  return data;
};

// ── Logout ────────────────────────────────────────────────────────────────────

export const logout = async () => {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch {
    // best-effort
  } finally {
    await clearTokens();
  }
};

// ── Refresh access token ──────────────────────────────────────────────────────

export const refreshAccessToken = async () => {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await res.json();
  if (!res.ok) {
    await clearTokens();
    throw new Error(data.message || 'Session expired');
  }

  await storeTokens(data.accessToken, data.refreshToken, await getStoredUser());
  return data.accessToken;
};
