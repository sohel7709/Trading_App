/**
 * DashboardScreen.js  (Final Post-Phase 3)
 * ─────────────────────────────────────────
 * Real-time institutional home screen for enrolled students.
 *
 * Components:
 *   - Top Section: Capital, Available Margin, Total PnL, Today PnL
 *   - Middle Section: Open Positions count, Win Rate %
 *   - Bottom Section: Mini 7-Day PnL Chart 📈
 *   - Header: Notification Bell with unread badge & Profile link
 *   - Risk Alert System: Soft Warning Banner & Hard Stop Modal
 *   - Real-time Sockets: pnl_update, positionTick, notification, risk_alert
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, Animated, Modal, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import useSocket from '../hooks/useSocket';
import useThrottledSocket from '../hooks/useThrottledSocket';
import { SOCKET_EVENTS } from '../socket/socketEvents';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => '₹' + Math.abs(Math.round(n || 0)).toLocaleString('en-IN');
const fmtPL = (n) => (n >= 0 ? '+' : '-') + fmt(n);
const pnlColor = (n) => (n >= 0 ? colors.gain : colors.loss);

export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // Live data
  const [portfolio, setPortfolio] = useState(null);
  const [positions, setPositions] = useState([]);
  const [indexes, setIndexes] = useState({});
  const [pnlTimeline, setPnlTimeline] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Risk alert state
  const [riskAlert, setRiskAlert] = useState(null); // { message, isHardStop }
  const [riskModalVisible, setRiskModalVisible] = useState(false);

  // ── Cache-First Load on Mount ──
  useEffect(() => {
    (async () => {
      try {
        const cached = await AsyncStorage.getItem('cache:dashboard');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.portfolio) setPortfolio(parsed.portfolio);
          if (parsed.indexes) setIndexes(parsed.indexes);
          if (typeof parsed.unreadNotifs === 'number') setUnreadNotifs(parsed.unreadNotifs);
          if (parsed.riskAlert) setRiskAlert(parsed.riskAlert);
          if (Array.isArray(parsed.pnlTimeline) && parsed.pnlTimeline.length > 0) {
            setPnlTimeline(parsed.pnlTimeline);
          }
        }
      } catch (e) {
        console.warn('Dashboard cache load error:', e.message);
      }
    })();
  }, []);

  // Initial balance fallbacks
  const startingCapital = user?.startingCapital || (user?.startingCapitalPaise ? user.startingCapitalPaise / 100 : 500000);
  const balance = portfolio?.balance ?? startingCapital;
  const availableMargin = portfolio?.availableMargin ?? balance;
  const usedMargin = portfolio?.usedMargin ?? 0;
  const blockedMargin = portfolio?.blockedMargin ?? 0;
  const totalPnl = portfolio?.totalPnl ?? 0;
  const todayPnl = portfolio?.todayPnl ?? 0;
  const winRate = portfolio?.winRate ?? 0;
  const openTradesCount = positions.length || (portfolio?.openPositionsCount ?? 0);
  const marginPercent = balance > 0 ? Math.min(100, Math.round((usedMargin / balance) * 100)) : 0;

  // ── Fetch Portfolio & History (Optimized via Combined GET /dashboard-summary) ──
  const fetchAll = useCallback(async () => {
    try {
      // 1. Try ultra-fast combined endpoint (1 single network call)
      const summary = await api.getDashboardSummary().catch(() => null);
      if (summary && summary.success) {
        if (summary.portfolio) setPortfolio(summary.portfolio);
        if (summary.indexes) setIndexes(summary.indexes);
        if (typeof summary.unreadNotifs === 'number') setUnreadNotifs(summary.unreadNotifs);
        if (summary.riskAlert) setRiskAlert(summary.riskAlert);
        if (Array.isArray(summary.pnlTimeline) && summary.pnlTimeline.length > 0) {
          setPnlTimeline(summary.pnlTimeline);
        }
        AsyncStorage.setItem('cache:dashboard', JSON.stringify(summary)).catch(() => {});
        return;
      }

      // Fallback: parallel fetch
      const studentId = user?._id || user?.id;
      const [portRes, idxData, notifRes, historyRes] = await Promise.all([
        api.getPortfolio().catch(() => null),
        api.getIndexes().catch(() => ({})),
        api.getNotifications().catch(() => []),
        studentId ? api.getStudentPnlHistory(studentId).catch(() => null) : Promise.resolve(null),
      ]);

      if (portRes) {
        setPortfolio(portRes);
        if (Array.isArray(portRes.positions)) {
          setPositions(portRes.positions);
        }
      }

      if (idxData && idxData.indexes) {
        setIndexes(idxData.indexes);
      }

      if (Array.isArray(notifRes)) {
        const unread = notifRes.filter(n => !n.read).length;
        setUnreadNotifs(unread);
        const latestRisk = notifRes.find(n => n.type === 'RISK' && !n.read);
        if (latestRisk) {
          setRiskAlert({ message: latestRisk.message, isHardStop: latestRisk.message?.toLowerCase().includes('max loss') });
        }
      }

      if (historyRes) {
        const timeline = Array.isArray(historyRes)
          ? historyRes.map(item => ({
              label: item.date ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'D',
              cumulativePnl: item.cumulativePnl ?? item.pnl ?? 0,
              pnl: item.pnl ?? 0,
            }))
          : (Array.isArray(historyRes.timeline) ? historyRes.timeline : []);
        if (timeline.length > 0) setPnlTimeline(timeline);
      } else {
        // Fallback 7-day points
        setPnlTimeline([
          { label: 'D1', cumulativePnl: 0 },
          { label: 'D2', cumulativePnl: Math.round(totalPnl * 0.2) },
          { label: 'D3', cumulativePnl: Math.round(totalPnl * 0.4) },
          { label: 'D4', cumulativePnl: Math.round(totalPnl * 0.5) },
          { label: 'D5', cumulativePnl: Math.round(totalPnl * 0.7) },
          { label: 'D6', cumulativePnl: Math.round(totalPnl * 0.85) },
          { label: 'D7', cumulativePnl: totalPnl },
        ]);
      }
    } catch (e) {
      console.warn('Dashboard fetch error:', e.message);
    } finally {
      setRefreshing(false);
    }
  }, [user?._id || user?.id]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  // ── Sockets: Real-Time Sync ────────────────────────────────────────────────
  useSocket('pnl_update', (data) => {
    if (!data) return;
    const currentUid = (user?._id || user?.id)?.toString();
    const targetUid = (data.studentId || data.userId)?.toString();
    if (!targetUid || !currentUid || targetUid !== currentUid) return;

    // Only apply targeted updates with margin/wallet data (e.g. from admin capital assignment)
    if (data.availableMargin !== undefined || data.wallet) {
      setPortfolio(prev => ({
        ...prev,
        ...(typeof data.todayPnl === 'number' ? { todayPnl: data.todayPnl } : {}),
        ...(typeof data.totalPnl === 'number' ? { totalPnl: data.totalPnl } : {}),
        ...(typeof data.balance === 'number' ? { balance: data.balance } : {}),
        ...(typeof data.availableMargin === 'number' ? { availableMargin: data.availableMargin } : {}),
        ...(typeof (data.totalUsedMargin ?? data.usedMargin) === 'number' ? { usedMargin: data.totalUsedMargin ?? data.usedMargin } : {}),
      }));
    }
  });

  const handlePositionTick = (data) => {
    if (!data) return;
    const eq = Array.isArray(data.positions) ? data.positions : [];
    const opt = Array.isArray(data.optionPositions) ? data.optionPositions : [];
    const combined = [...eq, ...opt];
    if (combined.length > 0 || (Array.isArray(data.positions) && Array.isArray(data.optionPositions))) {
      setPositions(prev => {
        const holdings = (prev || []).filter(p => p.kind === 'holding');
        return [...combined, ...holdings];
      });
    }
    setPortfolio(prev => {
      const next = { ...prev };
      if (typeof data.totalPnl === 'number') next.totalPnl = data.totalPnl;
      if (typeof data.todayPnl === 'number') next.todayPnl = data.todayPnl;
      else if (typeof data.totalPnl === 'number' && next.todayPnl === undefined) next.todayPnl = data.totalPnl;

      if (data.wallet) {
        if (typeof data.wallet.balance === 'number') next.balance = data.wallet.balance;
        if (typeof data.wallet.availableMargin === 'number') next.availableMargin = data.wallet.availableMargin;
        const used = data.wallet.totalUsedMargin ?? data.wallet.usedMargin;
        if (typeof used === 'number') next.usedMargin = used;
        if (typeof data.wallet.blockedMargin === 'number') next.blockedMargin = data.wallet.blockedMargin;
      }
      return next;
    });
  };

  useSocket(SOCKET_EVENTS.POSITION_TICK, handlePositionTick);
  useSocket('positionsTick', handlePositionTick);

  useSocket('orderExecuted', () => { fetchAll(); });
  useSocket('optionOrderExecuted', () => { fetchAll(); });
  useSocket('trade_update', () => { fetchAll(); });
  useSocket('walletUpdated', (data) => {
    if (data?.wallet) {
      setPortfolio(prev => ({
        ...prev,
        balance: data.wallet.balance ?? prev?.balance,
        availableMargin: data.wallet.availableMargin ?? prev?.availableMargin,
        usedMargin: (data.wallet.totalUsedMargin ?? data.wallet.usedMargin) ?? prev?.usedMargin,
        blockedMargin: data.wallet.blockedMargin ?? prev?.blockedMargin,
      }));
    }
  });

  useSocket('notification', (notif) => {
    setUnreadNotifs(prev => prev + 1);
    if (notif.type === 'RISK') {
      const isHard = notif.message?.toLowerCase().includes('max loss') || notif.title?.toLowerCase().includes('breach');
      setRiskAlert({ message: notif.message, isHardStop: isHard });
      if (isHard) setRiskModalVisible(true);
    }
  });

  useSocket('risk_alert', (alert) => {
    setRiskAlert({ message: alert.message, isHardStop: true });
    setRiskModalVisible(true);
  });

  useThrottledSocket('marketData', (data) => {
    if (data?.indexes) setIndexes(data.indexes);
  }, 300);

  // Chart data
  const miniChartLabels = pnlTimeline.length > 0
    ? pnlTimeline.slice(-7).map((t, idx) => (idx % 2 === 0 ? (t.label || `D${idx + 1}`) : ''))
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const miniChartData = pnlTimeline.length > 0
    ? pnlTimeline.slice(-7).map(t => t.cumulativePnl ?? t.pnl ?? 0)
    : [0, 0, 0, 0, 0, 0, 0];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* ── Top Header ────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={styles.liveBeacon} />
            <Text style={styles.liveText}>PAPER TRADING SIMULATOR</Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'Trader'} 👋</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Notification Bell */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color="#0F172A" />
            {unreadNotifs > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Profile Avatar */}
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="person" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAll(); }}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Risk Warning Banner (Soft Warning) ──────────────────── */}
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

        {/* ── TOP SECTION: Balance & PnL Overview ───────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroSub}>Available Trading Margin</Text>
              <Text style={styles.heroBalance}>{fmt(availableMargin)}</Text>
            </View>
            <TouchableOpacity
              style={styles.fundsPill}
              onPress={() => navigation.navigate('Funds')}
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
        </View>

        {/* ── MIDDLE SECTION: Performance Highlights ────────────────── */}
        <View style={styles.middleRow}>
          {/* Open Trades */}
          <TouchableOpacity
            style={styles.middleCard}
            onPress={() => navigation.navigate('Positions')}
            activeOpacity={0.85}
          >
            <View style={[styles.middleIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="layers-outline" size={20} color="#2563eb" />
            </View>
            <Text style={styles.middleLabel}>Open Positions</Text>
            <Text style={styles.middleValue}>{openTradesCount} Active</Text>
          </TouchableOpacity>

          {/* Win Rate */}
          <TouchableOpacity
            style={styles.middleCard}
            onPress={() => navigation.navigate('Analytics')}
            activeOpacity={0.85}
          >
            <View style={[styles.middleIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="trophy-outline" size={20} color="#059669" />
            </View>
            <Text style={styles.middleLabel}>Batch Win Rate</Text>
            <Text style={[styles.middleValue, { color: colors.gain }]}>{winRate}%</Text>
          </TouchableOpacity>
        </View>

        {/* ── F&O OPTION CHAIN DIRECT ACCESS BANNER ─────────────────── */}
        <TouchableOpacity
          style={styles.optionChainBanner}
          onPress={() => navigation.navigate('OptionChain', { indexName: 'NIFTY 50' })}
          activeOpacity={0.88}
        >
          <View style={styles.optionChainHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.optionChainIconBox}>
                <Ionicons name="git-network-outline" size={20} color="#6366f1" />
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.optionChainTitle}>Option Chain & F&O</Text>
                  <View style={styles.livePill}>
                    <Text style={styles.livePillText}>STRIKES</Text>
                  </View>
                </View>
                <Text style={styles.optionChainSub}>Live Greek IV, Call/Put chain & 1-tap trade</Text>
              </View>
            </View>
            <Ionicons name="arrow-forward-circle" size={26} color="#6366f1" />
          </View>

          {/* Quick Index Buttons */}
          <View style={styles.optionIndicesRow}>
            {['NIFTY 50', 'BANK NIFTY', 'FINNIFTY', 'SENSEX'].map((idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.optionIndexBtn}
                onPress={() => navigation.navigate('OptionChain', { indexName: idx })}
              >
                <Text style={styles.optionIndexBtnText}>{idx}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>

        {/* ── BOTTOM SECTION: Mini 7-Day PnL Chart 📈 ──────────────── */}
        <View style={styles.chartCard}>
          <View style={styles.chartCardHeader}>
            <View>
              <Text style={styles.chartSectionTitle}>7-Day P&L Equity Curve</Text>
              <Text style={styles.chartSectionSub}>Cumulative performance over time</Text>
            </View>
            <TouchableOpacity
              style={styles.chartFullBtn}
              onPress={() => navigation.navigate('Analytics')}
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
            width={SCREEN_WIDTH - 48}
            height={160}
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

        {/* ── Indices Ticker ────────────────────────────────────────── */}
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionHeaderTitle}>MARKET WATCH</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {(!indexes || Object.keys(indexes).length === 0) ? (
              <View style={styles.emptyIndexCard}>
                <Text style={{ fontSize: 12, color: '#94a3b8' }}>Loading market indices...</Text>
              </View>
            ) : (
              Object.values(indexes || {}).map((idx) => {
                const isGain = (idx.change ?? 0) >= 0;
                return (
                  <View key={idx.name || idx.symbol} style={styles.indexPill}>
                    <Text style={styles.indexName}>{idx.name || idx.symbol}</Text>
                    <Text style={[styles.indexPrice, { color: isGain ? colors.gain : colors.loss }]}>
                      {Number(idx.ltp || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.indexPct, { color: isGain ? colors.gain : colors.loss }]}>
                      {isGain ? '+' : ''}{Number(idx.changePercent ?? 0).toFixed(2)}%
                    </Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* ── Quick Trade CTA ───────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.tradeCtaBtn}
          onPress={() => navigation.navigate('Chain')}
          activeOpacity={0.88}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.tradeCtaIcon}>
              <Ionicons name="trending-up" size={22} color="#fff" />
            </View>
            <View>
              <Text style={styles.tradeCtaTitle}>Open Options & Trade</Text>
              <Text style={styles.tradeCtaSub}>NIFTY · BANKNIFTY live options chain</Text>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </ScrollView>

      {/* ── HARD STOP RISK ALERT MODAL ──────────────────────────────── */}
      <Modal
        visible={riskModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRiskModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalAlertIcon}>
              <Ionicons name="shield-outline" size={32} color={colors.loss} />
            </View>
            <Text style={styles.modalTitle}>Risk Limit Breached</Text>
            <Text style={styles.modalMessage}>
              {riskAlert?.message || 'You have reached your maximum daily loss threshold for this session.'}
            </Text>
            <Text style={styles.modalSub}>
              Further trading orders are temporarily restricted to protect your assigned capital.
            </Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => setRiskModalVisible(false)}
            >
              <Text style={styles.modalBtnText}>Acknowledge & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  liveBeacon: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.8,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.loss,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  riskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
  },
  riskBannerWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  riskBannerDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  riskBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  heroBalance: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  fundsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  fundsPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  pnlRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  pnlCol: {
    flex: 1,
    alignItems: 'center',
  },
  pnlLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  pnlValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  pnlDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  marginWrap: {},
  marginLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  marginPct: {
    fontSize: 12,
    fontWeight: '700',
  },
  marginBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  marginBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  middleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  middleCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  middleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  middleLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  middleValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  chartCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  chartSectionSub: {
    fontSize: 11,
    color: '#64748B',
  },
  chartFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  chartFullText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 2,
  },
  emptyIndexCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  indexPill: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 110,
  },
  indexName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  indexPrice: {
    fontSize: 14,
    fontWeight: '800',
  },
  indexPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  tradeCtaBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tradeCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tradeCtaTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  tradeCtaSub: {
    fontSize: 12,
    color: '#94A3B8',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalAlertIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: colors.loss,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  modalBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  optionChainBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  optionChainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionChainIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionChainTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  optionChainSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  livePill: {
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  livePillText: {
    color: '#4F46E5',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  optionIndicesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionIndexBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionIndexBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
});
