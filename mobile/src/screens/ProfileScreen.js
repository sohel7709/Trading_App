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
  Switch, StatusBar, Alert, Dimensions, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { AuthContext } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { getAccessToken, getStoredUser, setStoredUser } from '../services/authService';
import { api, BASE_URL } from '../api/client';
import useSocket from '../hooks/useSocket';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const auth = useContext(AuthContext);
  const [profileUser, setProfileUser] = useState(auth?.user || null);
  const [wallet, setWallet] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [pnlTimeline, setPnlTimeline] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [riskAlert, setRiskAlert] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh student profile, batch, capital & portfolio stats
  const loadProfileAndWallet = useCallback(async () => {
    try {
      const [stored, w, summary] = await Promise.all([
        getStoredUser().catch(() => null),
        api.getWallet().catch(() => null),
        api.getDashboardSummary().catch(() => null),
      ]);
      if (stored) setProfileUser(stored);
      if (w) setWallet(w);

      if (summary && summary.success) {
        if (summary.portfolio) setPortfolio(summary.portfolio);
        if (Array.isArray(summary.pnlTimeline) && summary.pnlTimeline.length > 0) {
          setPnlTimeline(summary.pnlTimeline);
        }
        if (typeof summary.unreadNotifs === 'number') setUnreadNotifs(summary.unreadNotifs);
        if (summary.riskAlert) setRiskAlert(summary.riskAlert);
      }

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
    } finally {
      setRefreshing(false);
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
    if (data?.todayPnl != null || data?.totalPnl != null) {
      setPortfolio(prev => ({
        ...prev,
        todayPnl: data.todayPnl ?? prev?.todayPnl ?? 0,
        totalPnl: data.totalPnl ?? prev?.totalPnl ?? 0,
      }));
    }
  });
  useSocket('notification', () => {
    setUnreadNotifs(prev => prev + 1);
  });
  useSocket('risk_alert', (alert) => {
    if (alert?.message) {
      setRiskAlert({ message: alert.message, isHardStop: true });
    }
  });

  const displayName = profileUser?.name || 'Student Trader';
  const displayEmail = profileUser?.email || '';
  const displayRoll = profileUser?.rollNumber || profileUser?.studentId || 'STU-24A';
  const displayBatch = profileUser?.batch?.name || (typeof profileUser?.batch === 'string' ? profileUser.batch : 'Batch 24-A · Options Basics');
  const displayInstructor = Array.isArray(profileUser?.batch?.instructors) && profileUser.batch.instructors.length > 0
    ? profileUser.batch.instructors.join(', ')
    : (profileUser?.instructorEmail || profileUser?.instructorName || 'intructor1@gmail.com');
  const displayInstitute = profileUser?.instituteName || profileUser?.instituteCode || 'TEST1';

  // Capital & PnL computations
  const assignedCapital = profileUser?.startingCapital ?? (profileUser?.startingCapitalPaise ? profileUser.startingCapitalPaise / 100 : (profileUser?.initialBalance ?? 500000));
  const currentFunds = wallet?.balance ?? (wallet?.balancePaise ? wallet.balancePaise / 100 : (portfolio?.balance ?? assignedCapital));
  const availableMargin = portfolio?.availableMargin ?? currentFunds;
  const usedMargin = portfolio?.usedMargin ?? 0;
  const totalPnl = portfolio?.totalPnl ?? 0;
  const todayPnl = portfolio?.todayPnl ?? 0;
  const winRate = portfolio?.winRate ?? 0;
  const openPositionsCount = portfolio?.openPositionsCount ?? (Array.isArray(portfolio?.positions) ? portfolio.positions.length : 0);
  const marginPercent = currentFunds > 0 ? Math.min(100, Math.round((usedMargin / currentFunds) * 100)) : 0;

  // Mini Chart data
  const miniChartLabels = pnlTimeline.length > 0
    ? pnlTimeline.slice(-7).map((t, idx) => (idx % 2 === 0 ? (t.label || `D${idx + 1}`) : ''))
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const miniChartData = pnlTimeline.length > 0
    ? pnlTimeline.slice(-7).map(t => t.cumulativePnl ?? t.pnl ?? 0)
    : [0, 0, 0, 0, 0, 0, 0];

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ST';

  const fmt = (n) => '₹' + Math.abs(Math.round(n || 0)).toLocaleString('en-IN');
  const fmtPL = (n) => (n >= 0 ? '+' : '-') + fmt(n);
  const pnlColor = (n) => (n >= 0 ? colors.gain : colors.loss);

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
        <View>
          <Text style={styles.topBarTitle}>Account & Profile</Text>
          <View style={styles.paperBadge}>
            <View style={styles.liveBeacon} />
            <Text style={styles.paperBadgeText}>PAPER TRADING SIMULATOR</Text>
          </View>
        </View>

        {/* Top Actions: Notifications Bell */}
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={20} color="#0F172A" />
          {unreadNotifs > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadProfileAndWallet(); }}
            colors={[colors.primary]}
          />
        }
      >
        {/* Risk Warning Banner (if active) */}
        {riskAlert && (
          <View style={[styles.riskBanner, riskAlert.isHardStop ? styles.riskBannerDanger : styles.riskBannerWarning]}>
            <Ionicons
              name={riskAlert.isHardStop ? 'alert-circle' : 'warning-outline'}
              size={18}
              color={riskAlert.isHardStop ? colors.loss : '#d97706'}
            />
            <Text style={[styles.riskBannerText, { color: riskAlert.isHardStop ? colors.loss : '#b45309' }]} numberOfLines={2}>
              {riskAlert.message}
            </Text>
            <TouchableOpacity onPress={() => setRiskAlert(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {/* Profile Identity Card */}
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

        {/* ── TRADING CAPITAL & LIVE P&L CARD ──────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroSub}>Available Trading Margin</Text>
              <Text style={styles.heroBalance}>{fmt(availableMargin)}</Text>
            </View>
            <TouchableOpacity
              style={styles.fundsPill}
              onPress={() => navigation.navigate('Funds')}
              activeOpacity={0.8}
            >
              <Ionicons name="wallet-outline" size={14} color="#0284c7" />
              <Text style={styles.fundsPillText}>Wallet</Text>
            </TouchableOpacity>
          </View>

          {/* PnL Highlights Row */}
          <View style={styles.pnlRow}>
            {/* Total PnL */}
            <View style={styles.pnlCol}>
              <Text style={styles.pnlLabel}>Total Net P&L</Text>
              <Text style={[styles.pnlValue, { color: pnlColor(totalPnl) }]}>
                {fmtPL(totalPnl)}
              </Text>
            </View>

            <View style={styles.pnlDivider} />

            {/* Today's PnL */}
            <View style={styles.pnlCol}>
              <Text style={styles.pnlLabel}>Today's P&L</Text>
              <Text style={[styles.pnlValue, { color: pnlColor(todayPnl) }]}>
                {fmtPL(todayPnl)}
              </Text>
            </View>
          </View>

          {/* Margin Utilization Progress */}
          <View style={styles.marginWrap}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={styles.marginLabel}>Margin Utilization</Text>
              <Text style={[styles.marginPct, { color: marginPercent > 80 ? colors.loss : marginPercent > 50 ? '#f59e0b' : '#10b981' }]}>
                {marginPercent}% ({fmt(usedMargin)} used)
              </Text>
            </View>
            <View style={styles.marginBarTrack}>
              <View
                style={[
                  styles.marginBarFill,
                  {
                    width: `${marginPercent}%`,
                    backgroundColor: marginPercent > 80 ? colors.loss : marginPercent > 50 ? '#f59e0b' : '#10b981',
                  }
                ]}
              />
            </View>
          </View>

          {/* Middle Performance Quick Stats */}
          <View style={styles.quickStatsRow}>
            <TouchableOpacity
              style={styles.quickStatCol}
              onPress={() => navigation.navigate('Positions')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickStatIcon, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="layers-outline" size={16} color="#2563eb" />
              </View>
              <View>
                <Text style={styles.quickStatLabel}>Positions</Text>
                <Text style={styles.quickStatValue}>{openPositionsCount} Active</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.quickStatDivider} />

            <TouchableOpacity
              style={styles.quickStatCol}
              onPress={() => navigation.navigate('Analytics')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickStatIcon, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="trophy-outline" size={16} color="#059669" />
              </View>
              <View>
                <Text style={styles.quickStatLabel}>Win Rate</Text>
                <Text style={[styles.quickStatValue, { color: colors.gain }]}>{winRate}%</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 7-DAY P&L EQUITY CURVE CHART ─────────────────────────── */}
        <View style={styles.chartCard}>
          <View style={styles.chartCardHeader}>
            <View>
              <Text style={styles.chartSectionTitle}>7-Day P&L Equity Curve</Text>
              <Text style={styles.chartSectionSub}>Cumulative performance</Text>
            </View>
            <TouchableOpacity
              style={styles.chartFullBtn}
              onPress={() => navigation.navigate('Analytics')}
              activeOpacity={0.8}
            >
              <Text style={styles.chartFullText}>Full Analytics</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <LineChart
            data={{
              labels: miniChartLabels,
              datasets: [{ data: miniChartData }],
            }}
            width={SCREEN_WIDTH - 64}
            height={150}
            yAxisLabel="₹"
            yAxisInterval={1}
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => (totalPnl >= 0 ? `rgba(16, 185, 129, ${opacity})` : `rgba(239, 68, 68, ${opacity})`),
              labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
              propsForDots: {
                r: '3',
                strokeWidth: '2',
                stroke: totalPnl >= 0 ? '#10b981' : '#ef4444',
              },
              propsForBackgroundLines: {
                strokeDasharray: '4 4',
                stroke: '#F1F5F9',
              },
            }}
            bezier
            style={{ marginVertical: 4, borderRadius: 16 }}
          />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  topBarTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  paperBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  liveBeacon: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  paperBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
    letterSpacing: 0.5,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.loss,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },

  riskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  riskBannerWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  riskBannerDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  riskBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroSub: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  heroBalance: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  fundsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  fundsPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },

  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  pnlCol: {
    flex: 1,
  },
  pnlDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 12,
  },
  pnlLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  pnlValue: {
    fontSize: 16,
    fontWeight: '800',
  },

  marginWrap: {
    marginBottom: 14,
  },
  marginLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  marginPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  marginBarTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  marginBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  quickStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  quickStatCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 10,
  },
  quickStatIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickStatLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  quickStatValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },

  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  chartCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  chartSectionSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  chartFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chartFullText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },

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
