import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import SkeletonLoader from '../components/SkeletonLoader';

const FILTERS = [
  { label: 'Today', days: 0 },
  { label: 'Last 7 Days', days: 7 },
  { label: 'This Month', days: 30 },
  { label: 'All Time', days: null },
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

export default function TradeJournalScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  const fetchTrades = useCallback(async (filter) => {
    setLoading(true);
    try {
      let query = '';
      if (filter.days === 0) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        query = `?from=${todayStart.toISOString()}`;
      } else if (filter.days) {
        const d = new Date();
        d.setDate(d.getDate() - filter.days);
        query = `?from=${d.toISOString()}`;
      }
      const res = await api.getTrades(query); 
      setTrades(Array.isArray(res) ? res : []);
    } catch (e) {
      console.warn('Trades fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchTrades(activeFilter);
  }, [activeFilter, fetchTrades]));

  const renderTrade = ({ item }) => {
    const isBuy = item.side === 'BUY';
    const symbol = item.stockSymbol || item.symbol || 'OPTION';
    const totalVal = item.totalValue || (item.quantity * item.price) || 0;
    const charges = item.charges ?? 20;

    return (
      <View style={styles.tradeCard}>
        {/* Top Header */}
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

        {/* Trade Metrics */}
        <View style={styles.cardBody}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Qty</Text>
            <Text style={styles.metricVal}>{item.quantity}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Price</Text>
            <Text style={styles.metricVal}>₹{item.price?.toFixed(2)}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Brokerage</Text>
            <Text style={styles.metricVal}>₹{charges.toFixed(2)}</Text>
          </View>
          <View style={[styles.metricCol, { alignItems: 'flex-end' }]}>
            <Text style={styles.metricLabel}>Total Amount</Text>
            <Text style={styles.metricValBold}>₹{totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
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
          <Text style={styles.headerSub}>{trades.length} executed trade{trades.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      {/* Date Filter Tabs */}
      <View style={styles.filtersRow}>
        {FILTERS.map(f => (
          <TouchableOpacity 
            key={f.label} 
            style={[styles.filterChip, activeFilter.label === f.label && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter.label === f.label && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content area */}
      <View style={styles.content}>
        {loading ? (
          <View style={{ padding: 16, gap: 12 }}>
            {[...Array(5)].map((_, i) => <SkeletonLoader key={i} width="100%" height={110} borderRadius={16} />)}
          </View>
        ) : trades.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="journal-outline" size={64} color={colors.border} />
            <Text style={styles.emptyTitle}>No trades recorded</Text>
            <Text style={styles.emptySub}>No orders executed for the selected period ({activeFilter.label}).</Text>
          </View>
        ) : (
          <FlatList
            data={trades}
            keyExtractor={item => item._id || String(Math.random())}
            renderItem={renderTrade}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
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
  headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },

  filtersRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9'
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F1F5F9'
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterTextActive: { color: '#FFFFFF' },

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
});
