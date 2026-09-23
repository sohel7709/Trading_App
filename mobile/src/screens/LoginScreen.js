import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin } from '../services/authService';

const REMEMBER_KEY = 'saved_credentials';

export default function LoginScreen({ onLogin }) {
  const insets = useSafeAreaInsets();
  const [instituteCode, setInstituteCode] = useState('');
  const [userId, setUserId]               = useState('');
  const [password, setPassword]           = useState('');
  const [showPwd, setShowPwd]             = useState(false);
  const [rememberMe, setRememberMe]       = useState(false);
  const [loading, setLoading]             = useState(false);
  const [focusedField, setFocusedField]   = useState(null);

  const userIdRef   = useRef(null);
  const passwordRef = useRef(null);

  // ── Load saved credentials on mount ────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY)
      .then(raw => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved.instituteCode) setInstituteCode(saved.instituteCode);
        if (saved.userId)        setUserId(saved.userId);
        if (saved.password)      setPassword(saved.password);
        setRememberMe(true);
      })
      .catch(() => {});
  }, []);

  // ── Login handler ───────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const trimmedId = userId.trim();
    const isEmail = trimmedId.includes('@');

    if (!isEmail && !instituteCode.trim()) {
      Alert.alert('Institute Code Required', 'Enter the code given by your instructor (or log in directly using your registered Email).\n\nExample: SRM-2026');
      return;
    }
    if (!trimmedId) {
      Alert.alert('Email or User ID Required', 'Enter your email address or User ID created by your instructor/admin.');
      return;
    }
    if (!password) {
      Alert.alert('Password Required', 'Enter your password.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiLogin(trimmedId, password, instituteCode.trim().toUpperCase());

      // Save or clear credentials based on Remember Me toggle
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_KEY, JSON.stringify({
          instituteCode: instituteCode.trim().toUpperCase(),
          userId: trimmedId,
          password,
        }));
      } else {
        await AsyncStorage.removeItem(REMEMBER_KEY);
      }

      onLogin?.(data.user);
    } catch (err) {
      Alert.alert(
        'Login Failed',
        err.message?.includes('Invalid') || err.message?.includes('credentials')
          ? 'Wrong Email/User ID or password. Please check and try again.'
          : err.message || 'Unable to connect. Make sure your phone is on the same Wi-Fi as the server.'
      );
    } finally {
      setLoading(false);
    }
  };


  const inputStyle = (field) => [
    st.inputBox,
    focusedField === field && st.inputBoxFocused,
  ];

  return (
    <KeyboardAvoidingView
      style={st.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        style={st.flex}
        contentContainerStyle={[st.scroll, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Logo */}
        <View style={st.logoRow}>
          <View style={st.logoBadge}>
            <Text style={st.logoBadgeText}>T</Text>
          </View>
          <Text style={st.logoName}>Trade Lab</Text>
        </View>

        <Text style={st.title}>Sign in</Text>
        <Text style={st.subtitle}>
          Use the credentials provided by your instructor.
        </Text>

        {/* ── Institute Code ─────────────────────────────────────────── */}
        <View style={st.formGroup}>
          <Text style={st.label}>Institute Code</Text>
          <View style={inputStyle('institute')}>
            <Text style={st.inputPrefix}>🏫</Text>
            <TextInput
              style={st.input}
              value={instituteCode}
              onChangeText={setInstituteCode}
              onFocus={() => setFocusedField('institute')}
              onBlur={() => setFocusedField(null)}
              placeholder="e.g. SRM-2026"
              placeholderTextColor="#c0c8d4"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => userIdRef.current?.focus()}
            />
          </View>
          <Text style={st.hint}>Ask your instructor for this code</Text>
        </View>

        {/* ── User ID ───────────────────────────────────────────────── */}
        <View style={st.formGroup}>
          <Text style={st.label}>User ID or Email</Text>
          <View style={inputStyle('userid')}>
            <Text style={st.inputPrefix}>👤</Text>
            <TextInput
              ref={userIdRef}
              style={st.input}
              value={userId}
              onChangeText={setUserId}
              onFocus={() => setFocusedField('userid')}
              onBlur={() => setFocusedField(null)}
              placeholder="STUD123 or email"
              placeholderTextColor="#c0c8d4"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>
        </View>

        {/* ── Password ──────────────────────────────────────────────── */}
        <View style={st.formGroup}>
          <Text style={st.label}>Password</Text>
          <View style={inputStyle('password')}>
            <Text style={st.inputPrefix}>🔒</Text>
            <TextInput
              ref={passwordRef}
              style={st.input}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              secureTextEntry={!showPwd}
              placeholder="Your password"
              placeholderTextColor="#c0c8d4"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              textContentType="password"
            />
            <TouchableOpacity
              onPress={() => setShowPwd(v => !v)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={st.showHide}>{showPwd ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Remember Me ───────────────────────────────────────────── */}
        <View style={st.rememberRow}>
          <Switch
            value={rememberMe}
            onValueChange={setRememberMe}
            trackColor={{ false: '#e2e8f0', true: '#bfdbfe' }}
            thumbColor={rememberMe ? '#1A73E8' : '#94a3b8'}
            ios_backgroundColor="#e2e8f0"
          />
          <View style={{ flex: 1 }}>
            <Text style={st.rememberLabel}>Remember me</Text>
            <Text style={st.rememberSub}>
              {rememberMe
                ? 'Credentials saved — you will not be asked again'
                : 'You will need to log in each time'}
            </Text>
          </View>
        </View>

        {/* ── Sign In Button ────────────────────────────────────────── */}
        <TouchableOpacity
          style={[st.btn, loading && { opacity: 0.75 }]}
          onPress={handleLogin}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={st.btnText}>Sign in</Text>
          }
        </TouchableOpacity>

        {/* ── Info ─────────────────────────────────────────────────── */}
        <View style={st.infoBox}>
          <Text style={st.infoText}>
            📊  TradeLab is a paper trading simulator.{'\n'}
            No real money, no real orders.
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  flex:  { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { paddingHorizontal: 26 },

  // Logo
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoBadge: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#1A73E8', justifyContent: 'center', alignItems: 'center',
  },
  logoBadgeText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  logoName: { fontSize: 20, fontWeight: '800', color: '#0f172a', letterSpacing: -0.4 },

  // Heading
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#64748b', lineHeight: 20, marginBottom: 28 },

  // Form
  formGroup: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 12, paddingHorizontal: 14, height: 52,
    backgroundColor: '#f8fafc',
  },
  inputBoxFocused: {
    borderColor: '#1A73E8',
    backgroundColor: '#ffffff',
  },
  inputPrefix: { fontSize: 16, marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    paddingVertical: 0,
  },
  showHide: { fontSize: 13, fontWeight: '700', color: '#1A73E8', paddingLeft: 8 },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 5 },

  // Remember Me
  rememberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 24, marginTop: 4,
    backgroundColor: '#f8fafc', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: '#f1f5f9',
  },
  rememberLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  rememberSub:   { fontSize: 11, color: '#64748b' },

  // Button
  btn: {
    backgroundColor: '#1A73E8', borderRadius: 14,
    height: 54, justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#1A73E8', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 5,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Info
  infoBox: {
    backgroundColor: '#f8fafc', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#f1f5f9',
  },
  infoText: { fontSize: 12, color: '#94a3b8', lineHeight: 19, textAlign: 'center' },
});
