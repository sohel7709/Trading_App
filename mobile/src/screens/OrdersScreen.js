import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, ScrollView, Animated,
} from 'react-native';
import { useSwipeTabs } from '../hooks/useSwipeTabs';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import IndexTicker from '../components/IndexTicker';

const TOP_TABS = ['Open', 'Executed', 'GTT', 'Baskets', 'SIP'];

const STATUS_COLOR = {
  EXECUTED: colors.gain,
  PENDING: colors.warning,
  CANCELLED: colors.textMuted,
  REJECTED: colors.loss,
};

export default function OrdersScreen({ navigation }) {
  const [tab, setTab] = useState(0);
  const [orders, setOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tradebook, setTradebook] = useState(false);
  const insets = useSafeAreaInsets();

  const { panHandlers, contentAnim } = useSwipeTabs({
    tabCount: TOP_TABS.length,
    tab,
    onTabChange: setTab,
  });

  const fetchData = async () => {
    try {
      const [o, t] = await Promise.all([api.getOrders(), api.getTrades()]);
      setOrders(o);
      setTrades(t);
    } catch (e) { console.warn(e.message); }
    finally { setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const cancelOrder = (order) => {
    Alert.alert('Cancel Order', `Cancel order for ${order.stockSymbol}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
          try {
            await api.cancelOrder(order._id);
            fetchData();
          } catch (e) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  // Kite-style: HH:MM:SS AM/PM format
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return formatTime(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
  };

  const getTabData = () => {
    if (tab === 0) return orders.filter(o => o.status === 'PENDING');
    // tab 1 = Executed — show today's executed orders sorted by time
    if (tab === 1) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return orders
        .filter(o => o.status === 'EXECUTED' && new Date(o.createdAt) >= today)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return [];
  };

  const renderOrder = ({ item }) => {
    const isBuy = item.side === 'BUY';
    const statusColor = STATUS_COLOR[item.status] ?? colors.textSecondary;

    return (
      <TouchableOpacity style={styles.orderCard} activeOpacity={0.7}>
        {/* Top row */}
        <View style={styles.orderTop}>
          <View style={styles.orderLeft}>
            {/* BUY / SELL tag */}
            <View style={[
              styles.sideTag,
              { backgroundColor: isBuy ? colors.gainLight : colors.lossLight },
            ]}>
              <Text style={[styles.sideText, { color: isBuy ? colors.gain : colors.loss }]}>
                {isBuy ? 'B' : 'S'}
              </Text>
            </View>

            <View>
              <Text style={styles.stockSymbol}>{item.stockSymbol}</Text>
              <Text style={styles.orderMeta}>{item.productType} · {item.type ?? 'MKT'}</Text>
            </View>
          </View>

          <View style={styles.orderRight}>
            <Text style={[styles.orderStatus, { color: statusColor }]}>{item.status}</Text>
            <Text style={styles.orderTime}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>

        {/* Details row */}
        <View style={styles.orderDetails}>
          <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>Qty </Text>{item.quantity}
          </Text>
          <Text style={styles.detailDot}>·</Text>
          <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>Price </Text>₹{Number(item.price).toFixed(2)}
          </Text>

          {item.status === 'PENDING' && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => cancelOrder(item)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIllustration}>
        <View style={styles.docCard1}>
          <View style={styles.docLine} />
          <View style={styles.docLine} />
          <View style={[styles.docLine, { width: '60%' }]} />
          <View style={styles.docSignature} />
        </View>
        <View style={styles.docCard2}>
          <View style={styles.docLine} />
          <View style={styles.docLine} />
          <View style={styles.docSignature} />
        </View>
        <View style={[styles.docAccent, { backgroundColor: '#F59E0B', borderRadius: 20, width: 18, height: 12, top: 10, right: 30 }]} />
        <View style={[styles.docAccent, { backgroundColor: '#387ED1', width: 12, height: 12, bottom: 10, left: 20, transform: [{ rotate: '45deg' }] }]} />
        <View style={[styles.docAccent, { backgroundColor: '#E64D3D', width: 10, height: 10, bottom: 14, right: 20, transform: [{ rotate: '45deg' }] }]} />
      </View>
      <Text style={styles.emptyTitle}>
        {tab === 0 ? 'No pending orders' : tab === 1 ? 'No executed orders today' : 'Nothing here'}
      </Text>
      <Text style={styles.emptySubtitle}>Place an order from your watchlist</Text>
    </View>
  );

  const data = getTabData();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Index ticker */}
      <IndexTicker
        indexes={{}}
        onIndexPress={(name) => navigation.navigate('IndexChart', { indexName: name })}
      />

      {/* Top tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsContainer}
        contentContainerStyle={styles.tabsContent}
      >
        {TOP_TABS.map((t, i) => (
          <TouchableOpacity
            key={t}
            style={styles.topTab}
            onPress={() => setTab(i)}
            activeOpacity={0.7}
          >
            <Text style={[styles.topTabText, tab === i && styles.topTabTextActive]}>{t}</Text>
            {tab === i && <View style={styles.topTabUnderline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filter bar */}
      <View style={styles.filterBar}>
        <TouchableOpacity style={styles.filterIcon}>
          <Ionicons name="search-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterIcon}>
          <Ionicons name="options-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.tradebookToggle}
          onPress={() => setTradebook(!tradebook)}
        >
          <View style={[styles.toggleCircle, tradebook && styles.toggleCircleActive]} />
          <Text style={styles.tradebookText}>Tradebook</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={{ flex: 1, opacity: contentAnim }} {...panHandlers}>
        <FlatList
          data={data}
          keyExtractor={(item, i) => item._id ?? String(i)}
          renderItem={renderOrder}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchData(); }}
            />
          }
          ListEmptyComponent={<EmptyState />}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // ── Tab bar ──────────────────────────────────────────────────────────────
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexGrow: 0,
    backgroundColor: colors.surface,
    height: 44,
  },
  tabsContent: { paddingHorizontal: 4 },
  topTab: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 44,
  },
  topTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    paddingBottom: 10,
  },
  topTabTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  topTabUnderline: {
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },

  // ── Filter bar ────────────────────────────────────────────────────────────
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: 2,
  },
  filterIcon: { padding: 6 },
  tradebookToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  toggleCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  toggleCircleActive: { backgroundColor: colors.primary },
  tradebookText: { fontSize: 13, fontWeight: '500', color: colors.text },

  // ── Order rows ────────────────────────────────────────────────────────────
  orderCard: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 56,
  },
  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  orderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sideTag: {
    width: 28,
    height: 28,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideText: { fontSize: 13, fontWeight: '800' },
  stockSymbol: { fontSize: 14, fontWeight: '700', color: colors.text },
  orderMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  orderRight: { alignItems: 'flex-end' },
  orderStatus: { fontSize: 12, fontWeight: '600' },
  orderTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  orderDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 38,
  },
  detailLabel: { color: colors.textSecondary },
  detailText: { fontSize: 13, color: colors.text },
  detailDot: { color: colors.textMuted },
  cancelBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.loss,
  },
  cancelText: { fontSize: 12, color: colors.loss, fontWeight: '600' },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIllustration: {
    width: 160,
    height: 140,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  docCard1: {
    width: 100,
    height: 110,
    backgroundColor: '#E8EAED',
    borderRadius: 6,
    padding: 12,
    justifyContent: 'center',
    gap: 8,
    transform: [{ rotate: '-8deg' }],
    position: 'absolute',
  },
  docCard2: {
    width: 90,
    height: 100,
    backgroundColor: '#D1D5DB',
    borderRadius: 6,
    padding: 12,
    justifyContent: 'center',
    gap: 8,
    transform: [{ rotate: '6deg' }],
    position: 'absolute',
    right: 10,
    bottom: 10,
  },
  docLine: { height: 6, backgroundColor: '#9CA3AF', borderRadius: 3, width: '80%' },
  docSignature: { height: 14, width: '60%', backgroundColor: '#9CA3AF', borderRadius: 3, marginTop: 4 },
  docAccent: { position: 'absolute' },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
