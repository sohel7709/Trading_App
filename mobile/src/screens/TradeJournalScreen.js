import React, { useState, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  StatusBar, RefreshControl, Modal, TextInput 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import SkeletonLoader from '../components/SkeletonLoader';

const PRESET_FILTERS = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'yesterday', label: 'Yesterday', isYesterday: true },
  { id: 'week', label: 'Last 7 Days', days: 7 },
  { id: 'month', label: 'Last 30 Days', days: 30 },
  { id: 'all', label: 'All Time', days: null },
  { id: 'custom', label: 'Custom Range 📅', isCustom: true },
];

const formatTradeTime = (isoString) => {
  if (!isoString) return '--:--:--';
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

const formatTradeDate = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const getIsoDateOnly = (date) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

export default function TradeJournalScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [trades, setTrades] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [summary, setSummary] = useState({
    grossPnl: 0,
    netPnl: 0,
    totalCharges: 0,
    totalTurnover: 0,
    totalTrades: 0,
    closedPositionsCount: 0,
    winCount: 0,
    lossCount: 0,
    winRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(PRESET_FILTERS[0]);
  const [activeTab, setActiveTab] = useState('EXECUTIONS'); // 'EXECUTIONS' | 'CLOSED'

  // Custom range state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customFrom, setCustomFrom] = useState(getIsoDateOnly(new Date()));
  const [customTo, setCustomTo] = useState(getIsoDateOnly(new Date()));
  const [appliedCustomFrom, setAppliedCustomFrom] = useState('');
  const [appliedCustomTo, setAppliedCustomTo] = useState('');

  // Calculate query params based on filter
  const buildDateQuery = useCallback((filter, customStart, customEnd) => {
    if (filter.isCustom) {
      if (customStart && customEnd) {
        return `?from=${customStart}&to=${customEnd}`;
      }
      return '';
    }

    if (filter.days === 0) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      return `?from=${todayStart.toISOString()}`;
    }

    if (filter.isYesterday) {
      const yStart = new Date();
      yStart.setDate(yStart.getDate() - 1);
      yStart.setHours(0, 0, 0, 0);
      const yEnd = new Date();
      yEnd.setDate(yEnd.getDate() - 1);
      yEnd.setHours(23, 59, 59, 999);
      return `?from=${yStart.toISOString()}&to=${yEnd.toISOString()}`;
    }

    if (filter.days) {
      const d = new Date();
      d.setDate(d.getDate() - filter.days);
      d.setHours(0, 0, 0, 0);
      return `?from=${d.toISOString()}`;
    }

    return ''; // All Time
  }, []);

  const fetchJournalData = useCallback(async (filter, customStart, customEnd) => {
    setLoading(true);
    try {
      const query = buildDateQuery(filter, customStart, customEnd);
      
      // Attempt detailed journal summary endpoint first
      let res;
      try {
        res = await api.getJournalSummary(query);
      } catch {
        // Fallback to getTrades
        res = null;
      }

      if (res && res.success) {
        setTrades(Array.isArray(res.trades) ? res.trades : []);
        setClosedPositions(Array.isArray(res.closedPositions) ? res.closedPositions : []);
        if (res.summary) {
          setSummary(res.summary);
        }
      } else {
        // Fallback: standard getTrades array
        const rawTrades = await api.getTrades(query);
        const safeTrades = Array.isArray(rawTrades) ? rawTrades : [];
        setTrades(safeTrades);

        // Derive summary from raw trades fallback
        const charges = safeTrades.reduce((s, t) => s + (t.charges || 0), 0);
        const turnover = safeTrades.reduce((s, t) => s + (t.totalValue || (t.price * t.quantity) || 0), 0);
        setSummary({
          grossPnl: 0,
          netPnl: -charges,
          totalCharges: charges,
          totalTurnover: turnover,
          totalTrades: safeTrades.length,
          closedPositionsCount: 0,
          winCount: 0,
          lossCount: 0,
          winRate: 0,
        });
      }
    } catch (e) {
      console.warn('Journal fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildDateQuery]);

  useFocusEffect(useCallback(() => {
    fetchJournalData(activeFilter, appliedCustomFrom, appliedCustomTo);
  }, [activeFilter, appliedCustomFrom, appliedCustomTo, fetchJournalData]));

  const handleFilterSelect = (filter) => {
    setActiveFilter(filter);
    if (filter.isCustom) {
      setShowCustomModal(true);
    } else {
      setAppliedCustomFrom('');
      setAppliedCustomTo('');
      fetchJournalData(filter, '', '');
    }
  };

  const handleApplyCustomRange = () => {
    setShowCustomModal(false);
    setAppliedCustomFrom(customFrom);
    setAppliedCustomTo(customTo);
    fetchJournalData(activeFilter, customFrom, customTo);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchJournalData(activeFilter, appliedCustomFrom, appliedCustomTo);
  };

  const netPnlIsPositive = (summary.netPnl || 0) >= 0;

  // Render individual trade fill card
  const renderTrade = ({ item }) => {
    const isBuy = item.side === 'BUY';
    const symbol = item.stockSymbol || item.symbol || 'OPTION';
    const totalVal = item.totalValue || (item.quantity * item.price) || 0;
    const charges = item.charges ?? 20;

    return (
      <View style={styles.tradeCard}>
        <View style={styles.cardHeader}>
          <View style={styles.symbolGroup}>
            <View style={[styles.sideBadge, isBuy ? styles.buyBadge : styles.sellBadge]}>
              <Text style={[styles.sideBadgeText, { color: isBuy ? colors.gain : colors.loss }]}>
                {item.side}
              </Text>
            </View>
            <View>
              <Text style={styles.symbolText}>{symbol}</Text>
              <Text style={styles.productTag}>{item.productType || 'NRML'}</Text>
            </View>
          </View>
          <View style={styles.timeGroup}>
            <Text style={styles.timeText}>{formatTradeTime(item.createdAt)}</Text>
            <Text style={styles.dateText}>{formatTradeDate(item.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardBody}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Qty</Text>
            <Text style={styles.metricVal}>{item.quantity}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Price</Text>
            <Text style={styles.metricVal}>₹{Number(item.price || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Brokerage</Text>
            <Text style={styles.metricVal}>₹{Number(charges || 0).toFixed(2)}</Text>
          </View>
          <View style={[styles.metricCol, { alignItems: 'flex-end' }]}>
            <Text style={styles.metricLabel}>Total Amount</Text>
            <Text style={styles.metricValBold}>₹{Number(totalVal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
        </View>
      </View>
    );
  };

  // Render individual closed position card
  const renderClosedPosition = ({ item }) => {
    const isGain = (item.pnl || 0) >= 0;
    return (
      <View style={styles.tradeCard}>
        <View style={styles.cardHeader}>
          <View style={styles.symbolGroup}>
            <View style={[styles.sideBadge, isGain ? styles.buyBadge : styles.sellBadge]}>
              <Text style={[styles.sideBadgeText, { color: isGain ? colors.gain : colors.loss }]}>
                CLOSED
              </Text>
            </View>
            <View>
              <Text style={styles.symbolText}>{item.symbol}</Text>
              <Text style={styles.productTag}>{item.kind?.toUpperCase() || 'EQUITY'} • {item.productType || 'MIS'}</Text>
            </View>
          </View>
          <View style={styles.timeGroup}>
            <Text style={[styles.timeText, { color: isGain ? colors.gain : colors.loss, fontSize: 15 }]}>
              {isGain ? '+' : ''}₹{Number(item.pnl || 0).toFixed(2)}
            </Text>
            <Text style={styles.dateText}>{item.dateStr || formatTradeDate(item.closedAt)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardBody}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Qty</Text>
            <Text style={styles.metricVal}>{item.quantity}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Entry</Text>
            <Text style={styles.metricVal}>₹{Number(item.avgPrice || 0).toFixed(2)}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Exit</Text>
            <Text style={styles.metricVal}>₹{Number(item.exitPrice || 0).toFixed(2)}</Text>
          </View>
          <View style={[styles.metricCol, { alignItems: 'flex-end' }]}>
            <Text style={styles.metricLabel}>Booked P&L</Text>
            <Text style={[styles.metricValBold, { color: isGain ? colors.gain : colors.loss }]}>
              {isGain ? '+' : ''}₹{Number(item.pnl || 0).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Trade Journal</Text>
          <Text style={styles.headerSub}>
            {activeFilter.isCustom && appliedCustomFrom && appliedCustomTo 
              ? `${appliedCustomFrom} → ${appliedCustomTo}` 
              : activeFilter.label}
          </Text>
        </View>
      </View>

      {/* Date Filter Chips Row */}
      <View style={styles.filtersRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={PRESET_FILTERS}
          keyExtractor={f => f.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item: f }) => (
            <TouchableOpacity 
              style={[styles.filterChip, activeFilter.id === f.id && styles.filterChipActive]}
              onPress={() => handleFilterSelect(f)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, activeFilter.id === f.id && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Selected Range P&L Card */}
      <View style={styles.pnlCardWrapper}>
        <View style={[styles.pnlCard, netPnlIsPositive ? styles.pnlCardGain : styles.pnlCardLoss]}>
          <View style={styles.pnlTopRow}>
            <View>
              <Text style={styles.pnlCardLabel}>
                {activeFilter.label.toUpperCase()} REALIZED NET P&L
              </Text>
              <Text style={[styles.pnlValueText, { color: netPnlIsPositive ? colors.gain : colors.loss }]}>
                {netPnlIsPositive ? '+' : ''}₹{Number(summary.netPnl || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[styles.pnlBadge, netPnlIsPositive ? styles.pnlBadgeGain : styles.pnlBadgeLoss]}>
              <Ionicons 
                name={netPnlIsPositive ? 'trending-up' : 'trending-down'} 
                size={16} 
                color={netPnlIsPositive ? '#065F46' : '#991B1B'} 
              />
              <Text style={[styles.pnlBadgeText, { color: netPnlIsPositive ? '#065F46' : '#991B1B' }]}>
                {netPnlIsPositive ? 'PROFIT' : 'LOSS'}
              </Text>
            </View>
          </View>

          <Text style={styles.pnlSubText}>
            Gross P&L: ₹{Number(summary.grossPnl || 0).toFixed(2)} • Charges: ₹{Number(summary.totalCharges || 0).toFixed(2)}
          </Text>

          <View style={styles.pnlDivider} />

          {/* Range Metrics Grid */}
          <View style={styles.pnlStatsRow}>
            <View style={styles.pnlStatItem}>
              <Text style={styles.pnlStatLabel}>Total Trades</Text>
              <Text style={styles.pnlStatVal}>{summary.totalTrades || trades.length}</Text>
            </View>
            <View style={styles.pnlStatItem}>
              <Text style={styles.pnlStatLabel}>Closed Positions</Text>
              <Text style={styles.pnlStatVal}>{summary.closedPositionsCount || closedPositions.length}</Text>
            </View>
            <View style={styles.pnlStatItem}>
              <Text style={styles.pnlStatLabel}>Win Rate</Text>
              <Text style={[styles.pnlStatVal, { color: (summary.winRate || 0) >= 50 ? colors.gain : colors.loss }]}>
                {summary.winRate || 0}%
              </Text>
            </View>
            <View style={[styles.pnlStatItem, { alignItems: 'flex-end' }]}>
              <Text style={styles.pnlStatLabel}>Turnover</Text>
              <Text style={styles.pnlStatVal}>₹{Math.round(summary.totalTurnover || 0).toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Sub Tabs: Executions vs Closed Positions */}
      <View style={styles.subTabBar}>
        <TouchableOpacity
          style={[styles.subTabBtn, activeTab === 'EXECUTIONS' && styles.subTabBtnActive]}
          onPress={() => setActiveTab('EXECUTIONS')}
        >
          <Text style={[styles.subTabText, activeTab === 'EXECUTIONS' && styles.subTabTextActive]}>
            Order Executions ({trades.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabBtn, activeTab === 'CLOSED' && styles.subTabBtnActive]}
          onPress={() => setActiveTab('CLOSED')}
        >
          <Text style={[styles.subTabText, activeTab === 'CLOSED' && styles.subTabTextActive]}>
            Closed P&L Legs ({closedPositions.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {loading ? (
          <View style={{ padding: 16, gap: 12 }}>
            {[...Array(4)].map((_, i) => <SkeletonLoader key={i} width="100%" height={105} borderRadius={16} />)}
          </View>
        ) : activeTab === 'EXECUTIONS' ? (
          trades.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="journal-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>No trades executed</Text>
              <Text style={styles.emptySub}>No buy or sell orders found for the selected date range.</Text>
            </View>
          ) : (
            <FlatList
              data={trades}
              keyExtractor={item => item._id || String(Math.random())}
              renderItem={renderTrade}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
          )
        ) : (
          closedPositions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>No closed positions</Text>
              <Text style={styles.emptySub}>No completed square-offs booked in this date range.</Text>
            </View>
          ) : (
            <FlatList
              data={closedPositions}
              keyExtractor={item => item._id || String(Math.random())}
              renderItem={renderClosedPosition}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
          )
        )}
      </View>

      {/* Custom Date Range Modal */}
      <Modal
        visible={showCustomModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Custom Date Range</Text>
              <TouchableOpacity onPress={() => setShowCustomModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHelp}>
              Enter dates in YYYY-MM-DD format to analyze trades & P&L for that period.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FROM DATE (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.dateInput}
                value={customFrom}
                onChangeText={setCustomFrom}
                placeholder="2026-09-01"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TO DATE (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.dateInput}
                value={customTo}
                onChangeText={setCustomTo}
                placeholder="2026-09-28"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Quick Presets */}
            <View style={styles.quickPresetsRow}>
              <TouchableOpacity 
                style={styles.quickPresetBtn}
                onPress={() => {
                  const d = new Date();
                  const endStr = getIsoDateOnly(d);
                  d.setDate(d.getDate() - 7);
                  setCustomFrom(getIsoDateOnly(d));
                  setCustomTo(endStr);
                }}
              >
                <Text style={styles.quickPresetText}>Last 7 Days</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.quickPresetBtn}
                onPress={() => {
                  const d = new Date();
                  const endStr = getIsoDateOnly(d);
                  d.setDate(d.getDate() - 14);
                  setCustomFrom(getIsoDateOnly(d));
                  setCustomTo(endStr);
                }}
              >
                <Text style={styles.quickPresetText}>Last 14 Days</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.quickPresetBtn}
                onPress={() => {
                  const d = new Date();
                  const endStr = getIsoDateOnly(d);
                  d.setDate(d.getDate() - 30);
                  setCustomFrom(getIsoDateOnly(d));
                  setCustomTo(endStr);
                }}
              >
                <Text style={styles.quickPresetText}>Last 30 Days</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.applyBtn}
              onPress={handleApplyCustomRange}
              activeOpacity={0.85}
            >
              <Text style={styles.applyBtnText}>Apply & Calculate P&L</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { 
    flexDirection: 'row', alignItems: 'center', 
    paddingHorizontal: 16, paddingVertical: 14, 
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' 
  },
  backBtn: { marginRight: 14, padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, color: colors.primary, marginTop: 1, fontWeight: '600' },

  filtersRow: {
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9'
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F1F5F9'
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterTextActive: { color: '#FFFFFF' },

  // P&L Card
  pnlCardWrapper: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  pnlCard: {
    padding: 16, borderRadius: 18, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  pnlCardGain: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  pnlCardLoss: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },

  pnlTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pnlCardLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.5 },
  pnlValueText: { fontSize: 26, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  pnlSubText: { fontSize: 12, color: '#64748B', marginTop: 4, fontWeight: '500' },

  pnlBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  pnlBadgeGain: { backgroundColor: '#DCFCE7' },
  pnlBadgeLoss: { backgroundColor: '#FEE2E2' },
  pnlBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  pnlDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 12 },

  pnlStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pnlStatItem: { flex: 1 },
  pnlStatLabel: { fontSize: 10, color: '#64748B', fontWeight: '600', marginBottom: 2 },
  pnlStatVal: { fontSize: 13, fontWeight: '700', color: colors.text },

  // Sub Tabs
  subTabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 8, marginBottom: 4,
    backgroundColor: '#E2E8F0', borderRadius: 12, padding: 3,
  },
  subTabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  subTabBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  subTabText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  subTabTextActive: { color: colors.text, fontWeight: '700' },

  content: { flex: 1 },
  listContainer: { padding: 16, gap: 12 },
  
  tradeCard: {
    backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  symbolGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sideBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  buyBadge: { backgroundColor: colors.gainLight },
  sellBadge: { backgroundColor: colors.lossLight },
  sideBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  symbolText: { fontSize: 15, fontWeight: '700', color: colors.text },
  productTag: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontWeight: '500' },

  timeGroup: { alignItems: 'flex-end' },
  timeText: { fontSize: 13, fontWeight: '700', color: colors.text },
  dateText: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },

  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricCol: { flex: 1 },
  metricLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 3, fontWeight: '500' },
  metricVal: { fontSize: 13, fontWeight: '600', color: colors.text },
  metricValBold: { fontSize: 14, fontWeight: '700', color: colors.text },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20
  },
  modalCard: {
    width: '100%', maxWidth: 380, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 8
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalHelp: { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 16 },

  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6 },
  dateInput: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text, fontWeight: '600'
  },

  quickPresetsRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  quickPresetBtn: { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  quickPresetText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },

  applyBtn: {
    backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 14, alignItems: 'center', marginTop: 8
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
