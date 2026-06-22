import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';

const CHAIN_INDICES = ['NIFTY 50', 'BANK NIFTY', 'SENSEX', 'FINNIFTY'];

function formatOI(val) {
  if (!val) return '-';
  if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return String(val);
}

function formatOIChange(val) {
  if (!val) return '-';
  const abs = Math.abs(val);
  const str = abs >= 1000000 ? `${(abs / 1000000).toFixed(1)}M` : abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : String(abs);
  return val >= 0 ? `+${str}` : `-${str}`;
}

export default function OptionChainScreen({ navigation, route }) {
  const initIndex = route?.params?.indexName || 'NIFTY 50';
  const [selectedIndex, setSelectedIndex] = useState(initIndex);
  const [expiries, setExpiries] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [chain, setChain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('chain'); // 'chain' | 'oi'
  const insets = useSafeAreaInsets();
  const intervalRef = useRef(null);
  const flatListRef = useRef(null);
  // Refs to avoid stale closures in the auto-refresh interval
  const selectedIndexRef  = useRef(selectedIndex);
  const selectedExpiryRef = useRef(selectedExpiry);
  selectedIndexRef.current  = selectedIndex;
  selectedExpiryRef.current = selectedExpiry;

  const fetchChain = useCallback(async (forcedExpiry) => {
    const idx    = selectedIndexRef.current;
    const expiry = forcedExpiry !== undefined ? forcedExpiry : selectedExpiryRef.current;
    try {
      const data = await api.getOptionChain(idx, expiry);
      setChain(data);
      if (data.expiries && data.expiries.length > 0) {
        setExpiries(data.expiries);
        // Set first expiry only if none selected yet
        if (!selectedExpiryRef.current) {
          setSelectedExpiry(data.expiries[0]);
        }
      }
    } catch (e) {
      console.warn('Option chain fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // no deps needed — uses refs

  // Scroll to ATM row after data loads
  useEffect(() => {
    if (chain?.rows && flatListRef.current) {
      const atmIndex = chain.rows.findIndex(r => r.isATM);
      if (atmIndex > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: Math.max(0, atmIndex - 3), animated: true });
        }, 400);
      }
    }
  }, [chain?.rows]);

  // Initial load when index changes + auto-refresh every 5s
  useEffect(() => {
    setLoading(true);
    setChain(null);
    setExpiries([]);
    setSelectedExpiry(null);
    selectedExpiryRef.current = null;

    fetchChain(null);

    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchChain(undefined), 5000);
    return () => clearInterval(intervalRef.current);
  }, [selectedIndex]);

  // Also update on socket marketData (index price changes)
  useEffect(() => {
    const socket = getSocket();
    const handler = (data) => {
      if (data.indexes && chain) {
        const idxData = data.indexes[selectedIndex];
        if (idxData) {
          setChain(prev => prev ? { ...prev, indexPrice: idxData.ltp, indexChange: idxData.change, indexChangePercent: idxData.changePercent } : prev);
        }
      }
    };
    socket.on('marketData', handler);
    return () => socket.off('marketData', handler);
  }, [selectedIndex, chain]);

  const onExpiryChange = (exp) => {
    setSelectedExpiry(exp);
    setLoading(true);
    fetchChain(exp);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    // Add noon time to avoid UTC→local timezone date shifts
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDate();
    const mon = d.toLocaleDateString('en-IN', { month: 'short' });
    const dow = d.toLocaleDateString('en-IN', { weekday: 'short' });
    return `${day} ${mon} (${dow})`;
  };

  const isGain = (chain?.indexChange ?? 0) >= 0;

  const renderRow = ({ item }) => {
    const isATM = item.isATM;
    const ceIsGain = item.ce.change >= 0;
    const peIsGain = item.pe.change >= 0;

    return (
      <View style={[styles.row, isATM && styles.atmRow]}>
        {/* CE side */}
        <View style={styles.ceCell}>
          <Text style={[styles.cellOI, { color: item.ce.oiChange >= 0 ? colors.gain : colors.loss }]}>
            {formatOIChange(item.ce.oiChange)}
          </Text>
          <Text style={styles.cellIV}>{item.ce.iv}%</Text>
          <Text style={[styles.cellLtp, isATM && styles.atmText]}>{item.ce.ltp.toFixed(1)}</Text>
          <Text style={[styles.cellChange, { color: ceIsGain ? colors.gain : colors.loss }]}>
            {ceIsGain ? '+' : ''}{item.ce.change.toFixed(1)}
          </Text>
        </View>

        {/* Strike */}
        <View style={[styles.strikeCell, isATM && styles.atmStrikeCell]}>
          <Text style={[styles.strikeText, isATM && styles.atmStrikeText]}>{item.strike}</Text>
          {isATM && <View style={styles.atmBadge}><Text style={styles.atmBadgeText}>ATM</Text></View>}
        </View>

        {/* PE side */}
        <View style={styles.peCell}>
          <Text style={[styles.cellChange, { color: peIsGain ? colors.gain : colors.loss }]}>
            {peIsGain ? '+' : ''}{item.pe.change.toFixed(1)}
          </Text>
          <Text style={[styles.cellLtp, isATM && styles.atmText]}>{item.pe.ltp.toFixed(1)}</Text>
          <Text style={styles.cellIV}>{item.pe.iv}%</Text>
          <Text style={[styles.cellOI, { color: item.pe.oiChange >= 0 ? colors.gain : colors.loss }]}>
            {formatOIChange(item.pe.oiChange)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Option Chain</Text>
        </View>
        <TouchableOpacity onPress={() => fetchChain(selectedExpiry)} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Index selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.indexSelector} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {CHAIN_INDICES.map(idx => (
          <TouchableOpacity
            key={idx}
            style={[styles.indexPill, selectedIndex === idx && styles.indexPillActive]}
            onPress={() => setSelectedIndex(idx)}
          >
            <Text style={[styles.indexPillText, selectedIndex === idx && styles.indexPillTextActive]}>{idx}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Index price banner */}
      {chain && (
        <View style={styles.priceBanner}>
          <View>
            <Text style={styles.bannerName}>{selectedIndex}</Text>
            <Text style={[styles.bannerPrice, { color: isGain ? colors.gain : colors.loss }]}>
              {Number(chain.indexPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.bannerChange, { color: isGain ? colors.gain : colors.loss }]}>
              {isGain ? '+' : ''}{Number(chain.indexChange ?? 0).toFixed(2)} ({isGain ? '+' : ''}{Number(chain.indexChangePercent ?? 0).toFixed(2)}%)
            </Text>
            <Text style={styles.bannerUpdated}>
              ATM: {chain.atmStrike}
            </Text>
          </View>
        </View>
      )}

      {/* Expiry selector — explicit height so it never collapses */}
      <View style={styles.expirySection}>
        <Text style={styles.expiryLabel}>Expiry</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.expiryContent}
        >
          {expiries.length === 0 ? (
            // Skeleton placeholders while loading
            [1,2,3,4,5].map(i => (
              <View key={i} style={styles.expirySkeleton} />
            ))
          ) : (
            expiries.map(exp => {
              const isActive = selectedExpiry === exp;
              return (
                <TouchableOpacity
                  key={exp}
                  style={[styles.expiryPill, isActive && styles.expiryPillActive]}
                  onPress={() => onExpiryChange(exp)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.expiryDate, isActive && styles.expiryDateActive]}>
                    {formatDate(exp)}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Column headers */}
      <View style={styles.colHeader}>
        <View style={styles.ceColHeader}>
          <Text style={styles.colHeaderText}>OI Chg</Text>
          <Text style={styles.colHeaderText}>IV</Text>
          <Text style={styles.colHeaderText}>LTP</Text>
          <Text style={styles.colHeaderText}>Chg</Text>
        </View>
        <View style={styles.strikeColHeader}>
          <Text style={[styles.colHeaderText, { textAlign: 'center', color: colors.text, fontWeight: '700' }]}>STRIKE</Text>
        </View>
        <View style={styles.peColHeader}>
          <Text style={styles.colHeaderText}>Chg</Text>
          <Text style={styles.colHeaderText}>LTP</Text>
          <Text style={styles.colHeaderText}>IV</Text>
          <Text style={styles.colHeaderText}>OI Chg</Text>
        </View>
      </View>

      <View style={styles.cePeLabels}>
        <Text style={[styles.cePeLabel, { color: colors.buyGreen }]}>CALLS (CE)</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.cePeLabel, { color: colors.sellRed }]}>PUTS (PE)</Text>
      </View>

      {/* Chain table */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading option chain...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={chain?.rows || []}
          keyExtractor={(item) => String(item.strike)}
          renderItem={renderRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchChain(selectedExpiry); }} />
          }
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={{ paddingBottom: 100 }}
          getItemLayout={(data, index) => ({ length: 44, offset: 44 * index, index })}
        />
      )}

      {/* Live indicator */}
      <View style={styles.liveBar}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Live · Auto-updates every 5s</Text>
        {chain?.lastUpdated && (
          <Text style={styles.liveTime}>
            {new Date(chain.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  refreshBtn: { padding: 6 },

  indexSelector: {
    flexGrow: 0,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  indexPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  indexPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  indexPillText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  indexPillTextActive: { color: '#fff' },

  priceBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  bannerName: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  bannerPrice: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  bannerChange: { fontSize: 13, fontWeight: '600' },
  bannerUpdated: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  // Expiry section — explicit height prevents horizontal ScrollView collapse
  expirySection: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#FAFAFA',
  },
  expiryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.4,
    paddingLeft: 14,
    paddingRight: 8,
    flexShrink: 0,
  },
  expiryContent: {
    alignItems: 'center',
    paddingRight: 14,
    gap: 8,
  },
  expiryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  expiryPillActive: {
    backgroundColor: '#FFF3E0',
    borderColor: '#F59E0B',
  },
  expiryDate: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  expiryDateActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  expirySkeleton: {
    width: 90,
    height: 30,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },

  colHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F3F4',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingVertical: 5,
  },
  ceColHeader: { flex: 5, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4 },
  strikeColHeader: { width: 68, justifyContent: 'center', alignItems: 'center' },
  peColHeader: { flex: 5, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4 },
  colHeaderText: { fontSize: 9, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.3 },

  cePeLabels: {
    flexDirection: 'row',
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  cePeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  row: {
    flexDirection: 'row',
    height: 44,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    alignItems: 'center',
  },
  atmRow: { backgroundColor: '#FFF9E6' },

  ceCell: {
    flex: 5, flexDirection: 'row',
    justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#F0FBF5',
  },
  peCell: {
    flex: 5, flexDirection: 'row',
    justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#FFF5F5',
  },
  strikeCell: {
    width: 68,
    alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
    backgroundColor: '#F8F9FA',
  },
  atmStrikeCell: { backgroundColor: '#FFF3CD' },
  strikeText: { fontSize: 11, fontWeight: '700', color: colors.text },
  atmStrikeText: { color: '#B45309', fontSize: 12 },
  atmBadge: {
    backgroundColor: '#F59E0B', borderRadius: 3,
    paddingHorizontal: 3, paddingVertical: 1, marginTop: 1,
  },
  atmBadgeText: { fontSize: 7, fontWeight: '800', color: '#fff' },

  cellOI: { fontSize: 9, fontWeight: '500', width: 32, textAlign: 'center' },
  cellIV: { fontSize: 9, color: colors.textSecondary, width: 28, textAlign: 'center' },
  cellLtp: { fontSize: 11, fontWeight: '700', color: colors.text, width: 36, textAlign: 'center' },
  cellChange: { fontSize: 9, fontWeight: '500', width: 28, textAlign: 'center' },
  atmText: { fontWeight: '800' },

  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingText: { fontSize: 13, color: colors.textSecondary },

  liveBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gain,
  },
  liveText: { fontSize: 11, color: colors.textSecondary, flex: 1 },
  liveTime: { fontSize: 11, color: colors.textMuted },
});
