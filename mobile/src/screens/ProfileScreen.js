/**
 * ProfileScreen.js (Institutional — v2 with Capital Summary)
 * ─────────────────────────────────────────────────────────
 * Student Profile Screen with:
 * - Capital & PnL Summary (previously on Dashboard)
 * - Risk Alert Banner (soft warning + hard stop)
 * - Student info, avatar, role badge
 * - Batch name & code, Instructor, Institute
 * - Quick links to Analytics, Journal, Funds
 * - Safe logout flow
 *
 * Real-time sockets: pnl_update, positionsTick, walletUpdated, notification, risk_alert
 */

import React, { useContext, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, StatusBar, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { getAccessToken, getStoredUser, setStoredUser } from '../services/authService';
import { api, BASE_URL } from '../api/client';
import useSocket from '../hooks/useSocket';
import { SOCKET_EVENTS } from '../socket/socketEvents';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (n) => '₹' + Math.abs(Math.round(n || 0)).toLocaleString('en-IN');
const fmtExact = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPL = (n) => (n >= 0 ? '+' : '-') + fmt(n);
const pnlColor = (n) => (n >= 0 ? colors.gain : colors.loss);

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const auth = useContext(AuthContext);
  const user = auth?.user;

  const [profileUser, setProfileUser] = useState(user || null);
  const [wallet, setWallet] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [positions, setPositions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Risk alert state (migrated from DashboardScreen)
  const [riskAlert, setRiskAlert] = useState(null);

  // ── Load profile, wallet & portfolio ─────────────────────────────────────
  const loadAll = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      // Cache-first load for instant paint
      const cached = await AsyncStorage.getItem('cache:profile-summary').catch(() => null);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.portfolio) setPortfolio(p.portfolio);
        if (p.wallet)    setWallet(p.wallet);
        if (p.riskAlert) setRiskAlert(p.riskAlert);
      }

      const [stored, w, portRes, notifRes] = await Promise.all([
        getStoredUser().catch(() => null),
        api.getWallet().catch(() => null),
        api.getPortfolio().catch(() => null),
        api.getNotifications().catch(() => []),
      ]);

      if (stored) setProfileUser(stored);
      if (w)      setWallet(w);
      if (portRes) {
        setPortfolio(portRes);
        if (Array.isArray(portRes.positions)) setPositions(portRes.positions);
      }

      // Risk alerts from unread notifications
      if (Array.isArray(notifRes)) {
        const latestRisk = notifRes.find(n => n.type === 'RISK' && !n.read);
        if (latestRisk) {
          setRiskAlert({ message: latestRisk.message, isHardStop: latestRisk.message?.toLowerCase().includes('max loss') });
        }
      }

      // Try combined dashboard summary for completeness
      const summary = await api.getDashboardSummary().catch(() => null);
      if (summary?.success) {
        if (summary.portfolio) setPortfolio(summary.portfolio);
        if (summary.riskAlert) setRiskAlert(summary.riskAlert);
        AsyncStorage.setItem('cache:profile-summary', JSON.stringify(summary)).catch(() => {});
      }

      // Also refresh /auth/me for latest profile data
      const token = await getAccessToken();
      if (token) {
        const res = await fetch(`${BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            setProfileUser(data.user);
            setStoredUser(data.user).catch(() => {});
          }
        }
      }
    } catch (e) {
      // keep whatever is cached
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // ── Real-time socket updates ─────────────────────────────────────────────
  useSocket('walletUpdated', (data) => {
    if (data?.wallet) setWallet(data.wallet);
    loadAll();
  });
  useSocket('wallet_updated', (data) => {
    const currentUid = (auth?.user?._id || auth?.user?.id)?.toString();
    const targetUid  = (data?.studentId || data?.userId)?.toString();
    if (targetUid && currentUid && targetUid !== currentUid) return;
    if (data) setWallet(prev => ({ ...prev, ...data }));
    loadAll();
  });
  useSocket('pnl_update', (data) => {
    if (!data) return;
    const currentUid = (auth?.user?._id || auth?.user?.id)?.toString();
    const targetUid  = (data.studentId || data.userId)?.toString();
    if (!targetUid || !currentUid || targetUid !== currentUid) return;
    if (data.availableMargin !== undefined || data.wallet) {
      setPortfolio(prev => ({
        ...prev,
        ...(typeof data.todayPnl       === 'number' ? { todayPnl: data.todayPnl }             : {}),
        ...(typeof data.totalPnl       === 'number' ? { totalPnl: data.totalPnl }             : {}),
        ...(typeof data.balance        === 'number' ? { balance: data.balance }               : {}),
        ...(typeof data.availableMargin=== 'number' ? { availableMargin: data.availableMargin }: {}),
        ...(typeof (data.totalUsedMargin ?? data.usedMargin) === 'number' ? { usedMargin: data.totalUsedMargin ?? data.usedMargin } : {}),
      }));
    }
  });

  const handlePositionTick = (data) => {
    if (!data) return;
    const eq  = Array.isArray(data.positions)       ? data.positions       : [];
    const opt = Array.isArray(data.optionPositions) ? data.optionPositions : [];
    const combined = [...eq, ...opt];
    if (combined.length > 0) {
      setPositions(prev => {
        const holdings = (prev || []).filter(p => p.kind === 'holding');
        return [...combined, ...holdings];
      });
    }
    setPortfolio(prev => {
      const next = { ...prev };
      if (typeof data.totalPnl === 'number') next.totalPnl = data.totalPnl;
      if (typeof data.todayPnl === 'number') next.todayPnl = data.todayPnl;
      if (data.wallet) {
        if (typeof data.wallet.balance         === 'number') next.balance         = data.wallet.balance;
        if (typeof data.wallet.availableMargin === 'number') next.availableMargin = data.wallet.availableMargin;
        const used = data.wallet.totalUsedMargin ?? data.wallet.usedMargin;
        if (typeof used === 'number') next.usedMargin = used;
      }
      return next;
    });
  };

  useSocket(SOCKET_EVENTS.POSITION_TICK, handlePositionTick);
  useSocket('positionsTick', handlePositionTick);
  useSocket('orderExecuted', () => loadAll());
  useSocket('optionOrderExecuted', () => loadAll());
  useSocket('trade_update', () => loadAll());

  useSocket('notification', (notif) => {
    if (notif?.type === 'RISK') {
      const isHard = notif.message?.toLowerCase().includes('max loss') || notif.title?.toLowerCase().includes('breach');
      setRiskAlert({ message: notif.message, isHardStop: isHard });
    }
  });
  useSocket('risk_alert', (alert) => {
    setRiskAlert({ message: alert.message, isHardStop: true });
  });

  // ── Derived values ───────────────────────────────────────────────────────
  const displayName       = profileUser?.name         || 'Student Trader';
  const displayEmail      = profileUser?.email        || '';
  const displayInstitute  = profileUser?.instituteName || profileUser?.instituteCode || 'TEST1';
  const displayBatch      = profileUser?.batch?.name  || (typeof profileUser?.batch === 'string' ? profileUser.batch : 'Batch 24-A · Options Basics');
  const displayInstructor = Array.isArray(profileUser?.batch?.instructors) && profileUser.batch.instructors.length > 0
    ? profileUser.batch.instructors.join(', ')
    : (profileUser?.instructorEmail || profileUser?.instructorName || '—');

  const assignedCapital = profileUser?.startingCapital
    ?? (profileUser?.startingCapitalPaise ? profileUser.startingCapitalPaise / 100 : (profileUser?.initialBalance ?? 0));

  // Portfolio-derived summary
  const balance        = portfolio?.balance        ?? wallet?.balance        ?? assignedCapital;
  const availableMargin= portfolio?.availableMargin?? wallet?.availableMargin?? balance;
  const usedMargin     = portfolio?.usedMargin     ?? wallet?.usedMargin     ?? 0;
  const totalPnl       = portfolio?.totalPnl       ?? 0;
  const todayPnl       = portfolio?.todayPnl       ?? 0;
  const winRate        = portfolio?.winRate        ?? 0;
  const openPositions  = positions.length          || (portfolio?.openPositionsCount ?? 0);
  const marginPct      = balance > 0 ? Math.min(100, Math.round((usedMargin / balance) * 100)) : 0;

  const initials = displayName.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'ST';

  const handleLogoutConfirm = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to end your trading session?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => auth?.logout?.() },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Profile</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} hitSlop={8}>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} colors={[colors.primary]} />}
      >

        {/* ── Risk Alert Banner ─────────────────────────────────────────── */}
        {riskAlert && (
          <View style={[styles.riskBanner, riskAlert.isHardStop ? styles.riskBannerDanger : styles.riskBannerWarning]}>
            <Ionicons
              name={riskAlert.isHardStop ? 'alert-circle' : 'warning-outline'}
              size={18}
              color={riskAlert.isHardStop ? colors.loss : '#b45309'}
            />
            <Text style={[styles.riskBannerText, { color: riskAlert.isHardStop ? colors.loss : '#b45309' }]} numberOfLines={2}>
              {riskAlert.message}
            </Text>
            <TouchableOpacity onPress={() => setRiskAlert(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={riskAlert.isHardStop ? colors.loss : '#b45309'} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Profile Hero Card ──────────────────────────────────────────── */}
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

        {/* ── Capital & PnL Summary (migrated from Dashboard) ───────────── */}
        <Text style={styles.sectionTitle}>CAPITAL & PERFORMANCE</Text>

        <View style={styles.summaryGrid}>
          {/* Row 1 */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Available Funds</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{fmtExact(availableMargin)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Margin Used</Text>
            <Text style={[styles.summaryValue, { color: usedMargin > 0 ? '#f59e0b' : colors.text }]}>
              {fmtExact(usedMargin)}
              {marginPct > 0 && <Text style={styles.summaryValueSmall}> ({marginPct}%)</Text>}
            </Text>
          </View>
          {/* Row 2 */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Today's P&L</Text>
            <Text style={[styles.summaryValue, { color: pnlColor(todayPnl) }]}>{fmtPL(todayPnl)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total P&L</Text>
            <Text style={[styles.summaryValue, { color: pnlColor(totalPnl) }]}>{fmtPL(totalPnl)}</Text>
          </View>
          {/* Row 3 */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Open Positions</Text>
            <Text style={styles.summaryValue}>{openPositions}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Win Rate</Text>
            <Text style={[styles.summaryValue, { color: winRate >= 50 ? colors.gain : colors.loss }]}>
              {winRate > 0 ? `${winRate.toFixed(1)}%` : '—'}
            </Text>
          </View>
        </View>

        {/* ── Batch & Academic Details ───────────────────────────────────── */}
        <Text style={styles.sectionTitle}>BATCH & ACADEMIC DETAILS</Text>
        <View style={styles.card}>
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
              {assignedCapital > 0 ? `₹${Number(assignedCapital).toLocaleString('en-IN')}` : '—'}
            </Text>
          </View>
        </View>

        {/* ── Quick Navigation Links ─────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>EXPLORE & TOOLS</Text>

        <View style={styles.card}>
          <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('Analytics')} activeOpacity={0.7}>
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

          <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('TradeJournal')} activeOpacity={0.7}>
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

          <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('Funds')} activeOpacity={0.7}>
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

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('Notifications')} activeOpacity={0.7}>
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#f5f3ff' }]}>
                <Ionicons name="notifications-outline" size={20} color="#7c3aed" />
              </View>
              <View>
                <Text style={styles.menuLabel}>Notifications & Alerts</Text>
                <Text style={styles.menuSub}>Risk alerts, fills & system messages</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* ── Settings ──────────────────────────────────────────────────── */}
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

        {/* ── Logout ────────────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogoutConfirm} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color={colors.loss} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Footer */}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 14 },

  // ── Risk Banner ─────────────────────────────────────────────────────────
  riskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  riskBannerWarning: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  riskBannerDanger:  { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  riskBannerText: { flex: 1, fontSize: 12, fontWeight: '600' },

  // ── Profile Hero ────────────────────────────────────────────────────────
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
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  profileTextWrap: { flex: 1 },
  name: { fontSize: 17, fontWeight: '800', color: colors.text },
  email: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  roleTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, alignSelf: 'flex-start',
  },
  roleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  roleText: { fontSize: 10, fontWeight: '700', color: '#065f46', letterSpacing: 0.5 },

  // ── Capital Summary Grid ─────────────────────────────────────────────────
  summaryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  summaryCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0',
    padding: 14,
  },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  summaryValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  summaryValueSmall: { fontSize: 11, fontWeight: '600' },

  // ── Shared card ──────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    borderWidth: 1, borderColor: '#E2E8F0', padding: 16,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#64748b',
    letterSpacing: 0.5, marginLeft: 4, marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 10,
  },
  detailLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  detailValue: { fontSize: 13, fontWeight: '700', color: colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 8 },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  menuRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 10,
  },
  prefRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 4,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconBox: {
    width: 36, height: 36, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  menuLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  menuSub: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },

  logoutBtn: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    paddingVertical: 14, borderRadius: 12, marginTop: 8,
  },
  logoutText: { fontSize: 14, fontWeight: '700', color: colors.loss },

  footer: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 8 },
});
