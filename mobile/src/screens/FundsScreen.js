/**
 * FundsScreen.js (Institutional Upgrade)
 * ─────────────────────────────────────────────────────────
 * Virtual Capital & Risk Margin Screen for Students:
 * - Displays Instructor Assigned Capital (₹5,00,000)
 * - Real-time Used vs Available Margin
 * - Color-coded margin utilization progress bar
 * - PnL and risk limit status
 * - No fake deposit/payment gateways
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, StatusBar, Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';
import useSocket from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';

const fmt = (n) =>
  '₹' + Math.abs(Number(n) ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPL = (n) => {
  const num = Number(n) || 0;
  return (num >= 0 ? '+' : '-') + fmt(num);
};

function BreakdownRow({ label, value, isBold, color, subText }) {
  return (
    <View style={styles.breakRow}>
      <View>
        <Text style={styles.breakLabel}>{label}</Text>
        {subText ? <Text style={styles.breakSub}>{subText}</Text> : null}
      </View>
      <Text style={[
        styles.breakValue,
        isBold && styles.breakValueBold,
        color ? { color } : null
      ]}>
        {value}
      </Text>
    </View>
  );
}

export default function FundsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [w, p] = await Promise.all([
        api.getWallet().catch(() => null),
        api.getPortfolio().catch(() => null),
      ]);
      if (w) setWallet(w);
      if (p) setPortfolio(p);
    } catch (e) {
      console.warn('[Funds] fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
  }, [fetchData]));

  // ── Live updates via socket ──
  const handlePositionsTick = (data) => {
    if (!data) return;
    if (data.wallet) {
      setWallet(prev => ({ ...prev, ...data.wallet }));
      setPortfolio(prev => ({
        ...prev,
        balance: data.wallet.balance ?? prev?.balance,
        availableMargin: data.wallet.availableMargin ?? prev?.availableMargin,
        usedMargin: data.wallet.totalUsedMargin ?? data.wallet.usedMargin ?? prev?.usedMargin,
        blockedMargin: data.wallet.blockedMargin ?? prev?.blockedMargin,
      }));
    }
    if (typeof data.totalPnl === 'number') {
      setPortfolio(prev => ({
        ...prev,
        totalPnl: data.totalPnl,
        todayPnl: data.todayPnl ?? prev?.todayPnl,
      }));
    }
  };

  useSocket('positionsTick', handlePositionsTick);

  useSocket('pnl_update', (data) => {
    if (!data) return;
    const currentUid = (user?._id || user?.id)?.toString();
    const targetUid = (data.studentId || data.userId)?.toString();
    if (!targetUid || !currentUid || targetUid !== currentUid) return;

    if (data.wallet) setWallet(prev => ({ ...prev, ...data.wallet }));
    if (data.availableMargin !== undefined) {
      setPortfolio(prev => ({
        ...prev,
        ...(typeof data.balance === 'number' ? { balance: data.balance } : {}),
        ...(typeof data.availableMargin === 'number' ? { availableMargin: data.availableMargin } : {}),
        ...(typeof (data.totalUsedMargin ?? data.usedMargin) === 'number' ? { usedMargin: data.totalUsedMargin ?? data.usedMargin } : {}),
        ...(typeof data.todayPnl === 'number' ? { todayPnl: data.todayPnl } : {}),
        ...(typeof data.totalPnl === 'number' ? { totalPnl: data.totalPnl } : {}),
      }));
    }
  });

  useSocket('trade_update', () => { fetchData(); });
  useSocket('orderExecuted', () => { fetchData(); });
  useSocket('optionOrderExecuted', () => { fetchData(); });

  useSocket('walletUpdated', (data) => {
    if (data?.wallet) {
      setWallet(prev => ({ ...prev, ...data.wallet }));
      setPortfolio(prev => ({
        ...prev,
        balance: data.wallet.balance ?? prev?.balance,
        availableMargin: data.wallet.availableMargin ?? prev?.availableMargin,
        usedMargin: (data.wallet.totalUsedMargin ?? data.wallet.usedMargin) ?? prev?.usedMargin,
        blockedMargin: data.wallet.blockedMargin ?? prev?.blockedMargin,
      }));
    }
  });

  const startingCapital = portfolio?.startingCapital || 500000;
  const available = Number(portfolio?.availableMargin ?? wallet?.availableMargin ?? 500000);
  const used = Number(portfolio?.usedMargin ?? wallet?.totalUsedMargin ?? wallet?.usedMargin ?? 0);
  const balance = Number(portfolio?.balance ?? wallet?.balance ?? startingCapital);
  const totalPnl = Number(portfolio?.totalPnl ?? (balance - startingCapital));

  const totalPool = Math.max(available + used, startingCapital);
  const usedRatio = totalPool > 0 ? Math.min(used / totalPool, 1) : 0;
  const usedPct = Math.round(usedRatio * 100);

  // Status color based on margin utilization
  const progressColor = usedPct > 80 ? colors.loss : (usedPct > 60 ? colors.warning : colors.primary);

  if (loading && !wallet && !portfolio) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Institutional Capital</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading assigned capital pool...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Virtual Funds & Margin</Text>
        <TouchableOpacity 
          style={styles.headerRight}
          onPress={() => Alert.alert('Simulated Capital', 'This capital is assigned by your institute for educational trading. Real money is not involved.')}
        >
          <Ionicons name="information-circle-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Institute Badge */}
        <View style={styles.instituteBadge}>
          <Ionicons name="shield-checkmark" size={16} color="#059669" />
          <Text style={styles.instituteBadgeText}>
            Simulated Trading Pool • Managed by Instructor
          </Text>
        </View>

        {/* Hero Card: Available Margin */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>AVAILABLE MARGIN</Text>
          <Text style={styles.heroAmount}>{fmt(available)}</Text>
          <Text style={styles.heroSub}>Deployable for new orders</Text>

          {/* Usage track */}
          <View style={styles.progressContainer}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${usedPct}%`, backgroundColor: progressColor }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.usageText}>Used: {usedPct}% ({fmt(used)})</Text>
              <Text style={styles.usageText}>Limit: 80% Max</Text>
            </View>
          </View>
        </View>

        {/* Capital Breakdown Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>CAPITAL ALLOCATION</Text>

          <BreakdownRow
            label="Assigned Capital"
            subText="Allocated by Institute"
            value={fmt(startingCapital)}
            isBold
          />
          <View style={styles.divider} />

          <BreakdownRow
            label="Current Balance"
            subText="Capital + Net P&L"
            value={fmt(balance)}
          />
          <View style={styles.divider} />

          <BreakdownRow
            label="Used Margin"
            subText="Active in open positions"
            value={fmt(used)}
            color={colors.loss}
          />
          <View style={styles.divider} />

          <BreakdownRow
            label="Total Net P&L"
            subText="Realized & unrealized"
            value={fmtPL(totalPnl)}
            isBold
            color={totalPnl >= 0 ? colors.gain : colors.loss}
          />
        </View>

        {/* Institutional Risk Guard Card */}
        <View style={styles.sectionCard}>
          <View style={styles.riskHeaderRow}>
            <Ionicons name="alert-circle-outline" size={18} color="#0284c7" />
            <Text style={[styles.sectionHeader, { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }]}>
              BATCH RISK RULES
            </Text>
          </View>

          <View style={styles.ruleRow}>
            <View style={styles.ruleDot} />
            <Text style={styles.ruleText}>Max daily loss limit: ₹10,000</Text>
          </View>
          <View style={styles.ruleRow}>
            <View style={styles.ruleDot} />
            <Text style={styles.ruleText}>Max margin usage allowed: 80% of wallet</Text>
          </View>
          <View style={styles.ruleRow}>
            <View style={styles.ruleDot} />
            <Text style={styles.ruleText}>Intraday auto square-off at 3:15 PM IST</Text>
          </View>
        </View>

        {/* Help Note */}
        <View style={styles.helpNote}>
          <Ionicons name="bulb-outline" size={20} color="#64748b" />
          <Text style={styles.helpText}>
            Need capital rebalance or reset? Contact your batch instructor via the live broadcast chat.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerBack: { padding: 4, marginRight: 10 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  headerRight: { padding: 4, marginLeft: 10 },

  scrollContent: { padding: 16, paddingBottom: 40, gap: 14 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: colors.textSecondary },

  instituteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  instituteBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065f46',
  },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  heroLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  heroAmount: { fontSize: 32, fontWeight: '800', color: colors.text, marginBottom: 4 },
  heroSub: { fontSize: 12, color: '#64748b', marginBottom: 18 },

  progressContainer: { width: '100%' },
  track: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    marginBottom: 8,
  },
  fill: { height: '100%', borderRadius: 4 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  usageText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  riskHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },

  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  breakLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  breakSub: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  breakValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  breakValueBold: { fontSize: 15, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  ruleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0284c7' },
  ruleText: { fontSize: 13, color: '#334155', fontWeight: '500' },

  helpNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  helpText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 18 },
});
