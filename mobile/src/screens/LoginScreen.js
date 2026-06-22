import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Prefilled credentials
const PREFILLED_USER_ID = 'TG3140';
const VALID_PASSWORD = 'Ashok@123';

export default function LoginScreen({ onLogin }) {
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState(PREFILLED_USER_ID);
  const [password, setPassword] = useState(VALID_PASSWORD);
  const [showPwd, setShowPwd] = useState(false);

  const handleLogin = () => {
    if (!userId.trim()) {
      return Alert.alert('Login', 'Please enter your Phone or User ID');
    }
    if (password !== VALID_PASSWORD) {
      return Alert.alert('Login failed', 'Invalid user ID or password. Please try again.');
    }
    onLogin?.();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.flex, { paddingTop: insets.top }]}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar: back + kite logo */}
        <View style={styles.topBar}>
          <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color="#444" />
          </TouchableOpacity>
          <View style={styles.kiteLogo}>
            <View style={styles.kiteLogoDark} />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Login</Text>

        {/* Phone or User ID — floating label */}
        <View style={styles.fieldOuter}>
          <View style={styles.labelChip}>
            <Text style={styles.labelChipText}>Phone or User ID</Text>
          </View>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              value={userId}
              onChangeText={setUserId}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Ionicons name="person-outline" size={20} color="#9aa3ab" />
          </View>
        </View>

        {/* Password */}
        <View style={[styles.inputBox, { marginTop: 18 }]}>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9aa3ab"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPwd}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowPwd(s => !s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9aa3ab" />
          </TouchableOpacity>
        </View>

        {/* Login button */}
        <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} activeOpacity={0.9}>
          <Text style={styles.loginBtnText}>LOGIN</Text>
        </TouchableOpacity>

        {/* Forgot link */}
        <TouchableOpacity style={styles.forgotWrap}>
          <Text style={styles.forgotText}>Forgot user ID or password?</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.footerBrand}>
            <Ionicons name="leaf" size={16} color="#9aa3ab" />
            <Text style={styles.footerBrandText}>ZERODHA</Text>
          </View>
          <Text style={styles.footerLegal}>
            Zerodha Broking Limited: Member of NSE, BSE, MCX - SEBI Reg. no. INZ000031633,
            CDSL - SEBI Reg. no. IN-DP-431-2019  |  <Text style={styles.footerLink}>Smart Online Dispute Resolution</Text>  |  <Text style={styles.footerLink}>SEBI SCORES</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 8, paddingBottom: 40,
  },
  kiteLogo: {
    width: 40, height: 30, justifyContent: 'center', alignItems: 'flex-end',
  },
  kiteLogoDark: {
    width: 0, height: 0,
    borderTopWidth: 15, borderBottomWidth: 15, borderLeftWidth: 26,
    borderTopColor: '#E8543B', borderBottomColor: '#B5341F', borderLeftColor: '#E8543B',
  },

  title: { fontSize: 34, fontWeight: '700', color: '#1a1a1a', marginBottom: 60 },

  fieldOuter: { position: 'relative' },
  labelChip: {
    position: 'absolute', top: -9, left: 14, zIndex: 2,
    backgroundColor: '#fff', paddingHorizontal: 6,
  },
  labelChipText: { fontSize: 13, color: '#8a929a' },

  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#d9dde1', borderRadius: 6,
    paddingHorizontal: 16, height: 64,
  },
  input: { flex: 1, fontSize: 18, color: '#1a1a1a', paddingVertical: 0 },

  loginBtn: {
    backgroundColor: '#4B7BEC', borderRadius: 8,
    height: 60, justifyContent: 'center', alignItems: 'center',
    marginTop: 28,
  },
  loginBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },

  forgotWrap: { alignItems: 'flex-end', marginTop: 24 },
  forgotText: { color: '#4B7BEC', fontSize: 16 },

  footer: { paddingTop: 30 },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  footerBrandText: { fontSize: 16, color: '#9aa3ab', fontWeight: '600', letterSpacing: 1 },
  footerLegal: { fontSize: 12.5, color: '#b5bcc2', lineHeight: 20 },
  footerLink: { textDecorationLine: 'underline', color: '#b5bcc2' },
});
