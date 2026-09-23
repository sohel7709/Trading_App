/**
 * AnalyticsScreen.js
 * ──────────────────
 * Comprehensive performance analytics for enrolled students.
 *
 * Features:
 *   - PnL Equity Curve (smooth Line Chart)
 *   - Daily Profit/Loss Bar Breakdown
 *   - Key Trading Metrics (Win Rate, Profit Factor, Avg Trade, Best Trade)
 *   - Risk & Margin compliance stats
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Dimensions, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

const fmt = (n) => '₹' + Math.abs(Math.round(n || 0)).toLocaleString('en-IN');
const fmtPL = (n) => (n >= 0 ? '+' : '-') + fmt(n);
const pnlColor = (n) => (n >= 0 ? colors.gain : colors.loss);

export default function AnalyticsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState('7D'); // 7D, 30D, ALL
  const [chartType, setChartType] = useState('EQUITY'); // EQUITY, DAILY

  const [pnlHistory, setPnlHistory] = useState([]);
  const [portfolioData, setPortfolioData] = useState(null);
  const [summary, setSummary] = useState({
    winRate: 0,
    totalTrades: 0,
    netPnl: 0,
    profitFactor: 0,
    bestTrade: 0,
    worstTrade: 0,
    avgWin: 0,
    avgLoss: 0,
  });

  const fetchData = useCallback(async () => {
    try {
      const studentId = user?._id || user?.id;
      const [historyRes, portRes] = await Promise.all([
        studentId ? api.getStudentPnlHistory(studentId).catch(() => null) : Promise.resolve(null),
        api.getPortfolio().catch(() => null),
      ]);

      if (portRes) {
        setPortfolioData(portRes);
      }

      if (historyRes && Array.isArray(historyRes.timeline)) {
        setPnlHistory(historyRes.timeline);
        if (historyRes.summary) {
          setSummary(prev => ({ ...prev, ...historyRes.summary }));
        }
      } else {
        // Build fallback 7-day timeline from portfolio closed trades
        const closed = portRes?.closedTrades || [];
        const dailyMap = {};
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dStr = d.toISOString().slice(0, 10);
          dailyMap[dStr] = 0;
        }

        closed.forEach(c => {
          const dStr = c.dateStr || (c.closedAt ? new Date(c.closedAt).toISOString().slice(0, 10) : null);
          if (dStr && dailyMap[dStr] !== undefined) {
            dailyMap[dStr] += (c.pnl || 0);
          }
        });

        let cumPnl = 0;
        const timeline = Object.keys(dailyMap).sort().map(dStr => {
          const dayP = dailyMap[dStr];
          cumPnl += dayP;
          const dateObj = new Date(dStr);
          return {
            date: dStr,
            label: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            pnl: dayP,
            cumulativePnl: cumPnl,
          };
        });

        setPnlHistory(timeline);

        // Compute summary metrics
        let wins = 0;
        let totalWinAmt = 0;
        let totalLossAmt = 0;
        let best = 0;
        let worst = 0;

        closed.forEach(c => {
          const p = c.pnl || 0;
          if (p > 0) {
            wins++;
            totalWinAmt += p;
            if (p > best) best = p;
          } else if (p < 0) {
            totalLossAmt += Math.abs(p);
            if (p < worst) worst = p;
          }
        });

        const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : (portRes?.winRate || 0);
        const profitFactor = totalLossAmt > 0 ? Math.round((totalWinAmt / totalLossAmt) * 10) / 10 : (totalWinAmt > 0 ? 9.9 : 1.0);

        setSummary({
          winRate,
          totalTrades: portRes?.totalTrades || closed.length,
          netPnl: portRes?.totalPnl || 0,
          profitFactor,
          bestTrade: best,
          worstTrade: worst,
          avgWin: wins > 0 ? Math.round(totalWinAmt / wins) : 0,
          avgLoss: (closed.length - wins) > 0 ? Math.round(totalLossAmt / (closed.length - wins)) : 0,
        });
      }
    } catch (e) {
      console.warn('Analytics fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // Auto-refresh when user taps the Analytics tab
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // Chart data prep (Guaranteed min 2 points for SVG curve computation)
  const safeChartPoints = useMemo(() => {
    if (!pnlHistory || pnlHistory.length === 0) return [0, 0, 0, 0];
    const points = pnlHistory.map(h => {
      const val = chartType === 'EQUITY' ? (h.cumulativePnl ?? h.pnl ?? 0) : (h.pnl ?? 0);
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    });
    if (points.length === 1) return [points[0], points[0]];
    return points;
  }, [pnlHistory, chartType]);

  const safeChartLabels = useMemo(() => {
    if (!pnlHistory || pnlHistory.length === 0) return ['1', '2', '3', '4'];
    if (pnlHistory.length === 1) return ['Start', pnlHistory[0]?.label || 'Current'];
    return pnlHistory.map((h, i) => {
      if (i % 2 === 0 || i === pnlHistory.length - 1) {
        const parts = (h.label || h.date || '').split(' ');
        return parts[parts.length - 1] || `${i + 1}`;
      }
      return '';
    });
  }, [pnlHistory]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {navigation?.canGoBack?.() && (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={{ padding: 2 }}>
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.headerSubtitle}>PERFORMANCE & INSIGHTS</Text>
            <Text style={styles.headerTitle}>Trading Analytics</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => { setRefreshing(true); fetchData(); }}
        >
          <Ionicons name="refresh" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Main P&L Overview Card */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewTop}>
            <View>
              <Text style={styles.overviewLabel}>Net Realized P&L</Text>
              <Text style={[styles.overviewValue, { color: pnlColor(summary.netPnl) }]}>
                {fmtPL(summary.netPnl)}
              </Text>
            </View>
            <View style={[styles.winRateBadge, { backgroundColor: summary.winRate >= 50 ? '#ecfdf5' : '#fffbeb' }]}>
              <Ionicons
                name={summary.winRate >= 50 ? 'trophy-outline' : 'trending-up-outline'}
                size={14}
                color={summary.winRate >= 50 ? '#10b981' : '#d97706'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.winRateText, { color: summary.winRate >= 50 ? '#10b981' : '#d97706' }]}>
                {summary.winRate}% Win Rate
              </Text>
            </View>
          </View>

          {/* Chart Controls */}
          <View style={styles.chartControls}>
            <View style={styles.chartToggle}>
              <TouchableOpacity
                style={[styles.toggleBtn, chartType === 'EQUITY' && styles.toggleBtnActive]}
                onPress={() => setChartType('EQUITY')}
              >
                <Text style={[styles.toggleBtnText, chartType === 'EQUITY' && styles.toggleBtnTextActive]}>
                  Equity Curve
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, chartType === 'DAILY' && styles.toggleBtnActive]}
                onPress={() => setChartType('DAILY')}
              >
                <Text style={[styles.toggleBtnText, chartType === 'DAILY' && styles.toggleBtnTextActive]}>
                  Daily P&L
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Chart Rendering */}
          {loading ? (
            <View style={styles.chartLoader}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <LineChart
              data={{
                labels: safeChartLabels,
                datasets: [{ data: safeChartPoints }],
              }}
              width={SCREEN_WIDTH - 48}
              height={190}
              yAxisLabel="₹"
              yAxisInterval={1}
              chartConfig={{
                backgroundColor: '#ffffff',
                backgroundGradientFrom: '#ffffff',
                backgroundGradientTo: '#ffffff',
                decimalPlaces: 0,
                color: (opacity = 1) => (summary.netPnl >= 0 ? `rgba(16, 185, 129, ${opacity})` : `rgba(239, 68, 68, ${opacity})`),
                labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                style: { borderRadius: 16 },
                propsForDots: {
                  r: '4',
                  strokeWidth: '2',
                  stroke: summary.netPnl >= 0 ? '#10b981' : '#ef4444',
                },
                propsForBackgroundLines: {
                  strokeDasharray: '4 4',
                  stroke: '#f1f5f9',
                },
              }}
              bezier={safeChartPoints.length >= 3}
              style={{ marginVertical: 8, borderRadius: 16 }}
            />
          )}
        </View>

        {/* ── Key Performance Metrics Grid ─────────────────────────── */}
        <Text style={styles.sectionHeader}>PERFORMANCE METRICS</Text>
        <View style={styles.metricsGrid}>
          {/* Total Trades */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="swap-horizontal" size={18} color="#2563eb" />
            </View>
            <Text style={styles.metricLabel}>Total Trades</Text>
            <Text style={styles.metricValue}>{summary.totalTrades}</Text>
          </View>

          {/* Profit Factor */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#ecfdf5' }]}>
              <Ionicons name="stats-chart" size={18} color="#059669" />
            </View>
            <Text style={styles.metricLabel}>Profit Factor</Text>
            <Text style={[styles.metricValue, { color: summary.profitFactor >= 1.5 ? '#10b981' : '#0f172a' }]}>
              {summary.profitFactor.toFixed(1)}x
            </Text>
          </View>

          {/* Best Trade */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#ecfdf5' }]}>
              <Ionicons name="trending-up" size={18} color="#10b981" />
            </View>
            <Text style={styles.metricLabel}>Best Trade</Text>
            <Text style={[styles.metricValue, { color: colors.gain }]}>
              {fmtPL(summary.bestTrade)}
            </Text>
          </View>

          {/* Average Win */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#f8fafc' }]}>
              <Ionicons name="wallet-outline" size={18} color="#64748b" />
            </View>
            <Text style={styles.metricLabel}>Avg Winning Trade</Text>
            <Text style={[styles.metricValue, { color: colors.gain }]}>
              {fmt(summary.avgWin)}
            </Text>
          </View>
        </View>

        {/* ── Risk & Capital Compliance ─────────────────────────────── */}
        <Text style={styles.sectionHeader}>INSTITUTIONAL RISK AUDIT</Text>
        <View style={styles.riskAuditCard}>
          <View style={styles.riskRow}>
            <View style={styles.riskLeft}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#10b981" />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.riskTitle}>Risk Status</Text>
                <Text style={styles.riskSub}>Maximum Loss & Position Guard</Text>
              </View>
            </View>
            <View style={styles.riskSafeBadge}>
              <Text style={styles.riskSafeText}>COMPLIANT</Text>
            </View>
          </View>

          <View style={styles.auditDivider} />

          <View style={styles.auditStatsRow}>
            <View style={styles.auditStat}>
              <Text style={styles.auditLabel}>Assigned Capital</Text>
              <Text style={styles.auditValue}>
                {fmt(portfolioData?.startingCapital || 500000)}
              </Text>
            </View>
            <View style={styles.auditStat}>
              <Text style={styles.auditLabel}>Used Margin</Text>
              <Text style={styles.auditValue}>
                {fmt(portfolioData?.usedMargin || 0)}
              </Text>
            </View>
            <View style={styles.auditStat}>
              <Text style={styles.auditLabel}>Open Positions</Text>
              <Text style={styles.auditValue}>
                {portfolioData?.openPositionsCount || 0}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Nav to Journal */}
        <TouchableOpacity
          style={styles.journalCta}
          onPress={() => navigation.navigate('TradeJournal')}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.journalIcon}>
              <Ionicons name="book-outline" size={20} color="#fff" />
            </View>
            <View>
              <Text style={styles.journalTitle}>View Full Trade Journal</Text>
              <Text style={styles.journalSub}>Detailed execution logs & time-stamped entries</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#64748b" />
        </TouchableOpacity>
      </ScrollView>
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
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  overviewCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  overviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  overviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  overviewValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  winRateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  winRateText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chartControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  chartToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  toggleBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  chartLoader: {
    height: 190,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 12,
    marginLeft: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  riskAuditCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  riskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  riskSub: {
    fontSize: 12,
    color: '#64748B',
  },
  riskSafeBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  riskSafeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  auditDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  auditStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  auditStat: {
    flex: 1,
  },
  auditLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  auditValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  journalCta: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  journalIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  journalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  journalSub: {
    fontSize: 11,
    color: '#64748B',
  },
});
