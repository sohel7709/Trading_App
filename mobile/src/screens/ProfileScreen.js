/**
 * ProfileScreen.js (Institutional Upgrade)
 * ─────────────────────────────────────────────────────────
 * Student Profile Screen with:
 * - Student info, avatar, role badge
 * - Batch name & code
 * - Assigned instructor details
 * - Institute name & code
 * - Quick links to Analytics, Journal, and Capital rules
 * - Safe logout flow
 */

import React, { useContext, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, StatusBar, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { getAccessToken, getStoredUser, setStoredUser } from '../services/authService';
import { api, BASE_URL } from '../api/client';
import useSocket from '../hooks/useSocket';

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const auth = useContext(AuthContext);
  const [profileUser, setProfileUser] = useState(auth?.user || null);
  const [wallet, setWallet] = useState(null);

  // Auto-refresh student profile, batch & capital when user taps Profile tab
  const loadProfileAndWallet = useCallback(async () => {
    try {
      const [stored, w] = await Promise.all([
        getStoredUser().catch(() => null),
        api.getWallet().catch(() => null),
      ]);
      if (stored) setProfileUser(stored);
      if (w) setWallet(w);

      const token = await getAccessToken();
      if (token) {
        const res = await fetch(`${BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            setProfileUser(data.user);
            setStoredUser(data.user).catch(() => {});
          }
        }
      }
    } catch (e) {
      // fallback
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfileAndWallet();
    }, [loadProfileAndWallet])
  );

  // Real-time capital & wallet updates from instructor
  useSocket('walletUpdated', (data) => {
    if (data?.wallet) setWallet(data.wallet);
    loadProfileAndWallet();
  });
  useSocket('wallet_updated', (data) => {
    const currentUid = (auth?.user?._id || auth?.user?.id)?.toString();
    const targetUid = (data?.studentId || data?.userId)?.toString();
    if (targetUid && currentUid && targetUid !== currentUid) return;
    if (data) setWallet(prev => ({ ...prev, ...data }));
    loadProfileAndWallet();
  });
  useSocket('pnl_update', (data) => {
    const currentUid = (auth?.user?._id || auth?.user?.id)?.toString();
    const targetUid = (data?.studentId || data?.userId)?.toString();
    if (!targetUid || !currentUid || targetUid !== currentUid) return;
    if (data?.balance != null) setWallet(prev => ({ ...prev, balance: data.balance }));
  });

  const displayName = profileUser?.name || 'Student Trader';
  const displayEmail = profileUser?.email || '';
  const displayRoll = profileUser?.rollNumber || profileUser?.studentId || 'STU-24A';
  const displayBatch = profileUser?.batch?.name || (typeof profileUser?.batch === 'string' ? profileUser.batch : 'Batch 24-A · Options Basics');
  const displayInstructor = Array.isArray(profileUser?.batch?.instructors) && profileUser.batch.instructors.length > 0
    ? profileUser.batch.instructors.join(', ')
    : (profileUser?.instructorEmail || profileUser?.instructorName || 'intructor1@gmail.com');
  const displayInstitute = profileUser?.instituteName || profileUser?.instituteCode || 'TEST1';
  const assignedCapital = profileUser?.startingCapital ?? (profileUser?.startingCapitalPaise ? profileUser.startingCapitalPaise / 100 : (profileUser?.initialBalance ?? 500000));
  const currentFunds = wallet?.balance ?? (wallet?.balancePaise ? wallet.balancePaise / 100 : assignedCapital);

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ST';

  const handleLogoutConfirm = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to end your trading session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => auth?.logout?.()
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Student Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileHero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileTextWrap}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.email}>{displayEmail}</Text>
            <View style={styles.roleTag}>
              <View style={styles.roleDot} />
              <Text style={styles.roleText}>ACTIVE STUDENT • {displayInstitute}</Text>
            </View>
          </View>
        </View>

        {/* Institutional Academic Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>BATCH & ACADEMIC DETAILS</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Batch</Text>
            <Text style={styles.detailValue}>{displayBatch}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Instructor</Text>
            <Text style={styles.detailValue}>{displayInstructor}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Institute Code</Text>
            <Text style={styles.detailValue}>{displayInstitute}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Assigned Virtual Capital</Text>
            <Text style={[styles.detailValue, { color: colors.gain, fontWeight: '800' }]}>
              ₹{Number(assignedCapital).toLocaleString('en-IN')}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Available Margin / Funds</Text>
            <Text style={[styles.detailValue, { color: colors.primary, fontWeight: '700' }]}>
              ₹{Number(currentFunds).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* Quick Navigation Links */}
        <Text style={styles.sectionTitle}>EXPLORE & TOOLS</Text>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('Analytics')}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="bar-chart-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.menuLabel}>Performance Analytics</Text>
                <Text style={styles.menuSub}>PnL curve, win rate & profit factor</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('TradeJournal')}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="journal-outline" size={20} color="#059669" />
              </View>
              <View>
                <Text style={styles.menuLabel}>Trade Journal</Text>
                <Text style={styles.menuSub}>Filter by day, week, month</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate('Funds')}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="wallet-outline" size={20} color="#b45309" />
              </View>
              <View>
                <Text style={styles.menuLabel}>Funds & Margin Limits</Text>
                <Text style={styles.menuSub}>Virtual capital allocation & risk usage</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionTitle}>SETTINGS</Text>

        <View style={styles.card}>
          <View style={styles.prefRow}>
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#f8fafc' }]}>
                <Ionicons name="notifications-outline" size={20} color="#64748b" />
              </View>
              <Text style={styles.menuLabel}>Live Order & Risk Alerts</Text>
            </View>
            <Switch value={true} trackColor={{ false: '#e2e8f0', true: colors.primary }} />
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogoutConfirm}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.loss} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Version Footer */}
        <Text style={styles.footer}>TradeLab Institutional Engine • v3.0 Production Build</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  topBarTitle: { fontSize: 20, fontWeight: '700', color: colors.text },

  scrollContent: { padding: 16, paddingBottom: 40, gap: 14 },

  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  profileTextWrap: { flex: 1 },
  name: { fontSize: 17, fontWeight: '800', color: colors.text },
  email: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  roleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  roleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  roleText: { fontSize: 10, fontWeight: '700', color: '#065f46', letterSpacing: 0.5 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  detailValue: { fontSize: 13, fontWeight: '700', color: colors.text },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginLeft: 4,
    marginTop: 4,
  },

  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  menuSub: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },

  logoutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  logoutText: { fontSize: 14, fontWeight: '700', color: colors.loss },

  footer: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
});
