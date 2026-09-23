import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, ScrollView, Animated, Modal, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSwipeTabs } from '../hooks/useSwipeTabs';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import useSocket from '../hooks/useSocket';
import IndexTicker from '../components/IndexTicker';

const STATUS_COLOR = {
  EXECUTED: '#16A34A',
  PENDING: '#D97706',
  CANCELLED: '#64748B',
  REJECTED: '#DC2626',
};

const STATUS_BG = {
  EXECUTED: '#DCFCE7',
  PENDING: '#FEF3C7',
  CANCELLED: '#F1F5F9',
  REJECTED: '#FEE2E2',
};

/**
 * Formats date into exact time with second and readable date:
 * e.g. "01:45:22 PM · 17 Sep 2026"
 */
export function formatExactTimestamp(dateStr) {
  if (!dateStr) return '--:--:--';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--:--:--';
    const timeStr = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const dateStrFormatted = d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return `${timeStr} · ${dateStrFormatted}`;
  } catch {
    return '--:--:--';
  }
}

export default function OrdersScreen({ navigation, route }) {
  const [tab, setTab] = useState(route?.params?.initialTab !== undefined ? Number(route.params.initialTab) : (route?.params?.tab === 'executed' ? 1 : 0)); // 0: Open, 1: Executed, 2: All, 3: Baskets
  const [orders, setOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [baskets, setBaskets] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [modifyOrder, setModifyOrder] = useState(null);
  const [basketBuilderOpen, setBasketBuilderOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const TOP_TABS = [
    { label: 'Open', key: 'open' },
    { label: 'Executed', key: 'executed' },
    { label: 'All Orders', key: 'all' },
    { label: 'Baskets', key: 'baskets' },
  ];

  const { panHandlers, contentAnim } = useSwipeTabs({
    tabCount: TOP_TABS.length,
    tab,
    onTabChange: setTab,
  });

  const fetchData = useCallback(async () => {
    try {
      const [o, t, b] = await Promise.all([
        api.getOrders().catch((e) => { console.warn('[OrdersScreen] getOrders failed:', e.message); return []; }),
        api.getTrades().catch((e) => { console.warn('[OrdersScreen] getTrades failed:', e.message); return []; }),
        api.getBaskets().catch((e) => { console.warn('[OrdersScreen] getBaskets failed:', e.message); return []; }),
      ]);
      console.log('[OrdersScreen] Fetched: orders=' + (Array.isArray(o) ? o.length : 0) + ' trades=' + (Array.isArray(t) ? t.length : 0));
      setOrders(Array.isArray(o) ? o : []);
      setTrades(Array.isArray(t) ? t : []);
      setBaskets(Array.isArray(b) ? b : []);
    } catch (e) {
      console.warn('[OrdersScreen] Error fetching orders:', e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (route?.params?.initialTab !== undefined) {
      setTab(Number(route.params.initialTab));
    } else if (route?.params?.tab === 'executed') {
      setTab(1);
    } else if (route?.params?.tab === 'open') {
      setTab(0);
    }
    fetchData();
  }, [fetchData, route?.params]));

  // ── Real-Time Sockets ──────────────────────────────────────────────────────
  useSocket('orderExecuted', () => {
    fetchData();
  });
  useSocket('orderCreated', () => {
    fetchData();
  });
  useSocket('orderPending', () => {
    fetchData();
  });
  useSocket('orderModified', () => {
    fetchData();
  });
  useSocket('orderCancelled', () => {
    fetchData();
  });
  useSocket('optionOrderExecuted', () => {
    fetchData();
  });
  useSocket('trade_update', () => {
    fetchData();
  });
  useSocket('walletUpdated', () => {
    fetchData();
  });

  const cancelOrder = (order) => {
    const symbol = order.stockSymbol || order.symbol || 'Instrument';
    Alert.alert(
      'Cancel Order',
      `Are you sure you want to cancel the open order for ${symbol}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel Order',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.cancelOrder(order._id);
              fetchData();
              Alert.alert('Order Cancelled', `Your order for ${symbol} has been cancelled.`);
            } catch (e) {
              Alert.alert('Cancellation Error', e.message || 'Unable to cancel order.');
            }
          },
        },
      ]
    );
  };

  const executeBasket = async (basket) => {
    try {
      const res = await api.executeBasket(basket._id);
      const failed = res?.results?.filter(r => r.status === 'failed') || [];
      Alert.alert(
        'Basket Executed',
        failed.length
          ? `${res.results.length - failed.length}/${res.results.length} legs placed.\nFailed: ${failed.map(f => `${f.stockSymbol} (${f.error})`).join(', ')}`
          : `All ${res?.results?.length || 0} legs placed.`
      );
      fetchData();
    } catch (e) {
      Alert.alert('Basket Error', e.message);
    }
  };

  const deleteBasket = (basket) => {
    Alert.alert('Delete basket', `Delete "${basket.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api.deleteBasket(basket._id);
          fetchData();
        },
      },
    ]);
  };

  const safeOrders = Array.isArray(orders) ? orders : [];
  const openOrdersCount = safeOrders.filter(o => {
    const s = String(o?.status || '').toUpperCase();
    return s === 'PENDING' || s === 'TRIGGER_PENDING';
  }).length;
  const executedOrdersCount = safeOrders.filter(o => {
    const s = String(o?.status || '').toUpperCase();
    return s === 'EXECUTED';
  }).length;

  const getFilteredData = () => {
    let list = [];
    if (tab === 0) {
      list = safeOrders.filter(o => {
        const s = String(o?.status || '').toUpperCase();
        return s === 'PENDING' || s === 'TRIGGER_PENDING';
      });
    } else if (tab === 1) {
      list = safeOrders
        .filter(o => String(o?.status || '').toUpperCase() === 'EXECUTED')
        .sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt));
    } else if (tab === 2) {
      list = [...safeOrders].sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt));
    } else if (tab === 3) {
      return baskets;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(o =>
        (o.stockSymbol || o.symbol || '').toLowerCase().includes(q) ||
        (o.productType || '').toLowerCase().includes(q) ||
        (o.type || o.orderType || '').toLowerCase().includes(q)
      );
    }
    return list;
  };

  const renderOrder = ({ item }) => {
    const isBuy = String(item.side || 'BUY').toUpperCase() === 'BUY';
    const status = String(item.status || 'PENDING').toUpperCase();
    const statusColor = STATUS_COLOR[status] ?? colors.textSecondary;
    const statusBg = STATUS_BG[status] ?? '#F1F5F9';
    const isPending = status === 'PENDING' || status === 'TRIGGER_PENDING';
    const isExecuted = status === 'EXECUTED';
    const symbol = item.stockSymbol || item.symbol || 'Instrument';
    const exactTime = formatExactTimestamp(item.createdAt || item.updatedAt);
    const orderQty = item.quantity ?? item.qty ?? 1;
    const orderPrice = Number(item.price || item.averagePrice || 0);
    const orderTotal = orderQty * orderPrice;

    return (
      <View style={styles.orderCard}>
        {/* Header Row: BUY/SELL Badge, Symbol & Product info, Status Badge */}
        <View style={styles.orderHeader}>
          <View style={styles.headerLeft}>
            <View style={[styles.sideBadge, { backgroundColor: isBuy ? '#DCFCE7' : '#FEE2E2' }]}>
              <Text style={[styles.sideBadgeText, { color: isBuy ? '#16A34A' : '#DC2626' }]}>
                {isBuy ? 'BUY' : 'SELL'}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.stockSymbol} numberOfLines={1}>{symbol}</Text>
              <View style={styles.tagRow}>
                <View style={styles.pillTag}>
                  <Text style={styles.pillTagText}>{item.productType || 'NRML'}</Text>
                </View>
                <View style={styles.pillTag}>
                  <Text style={styles.pillTagText}>{item.type || item.orderType || 'MKT'}</Text>
                </View>
                {item.triggerPrice ? (
                  <View style={[styles.pillTag, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.pillTagText, { color: '#B45309' }]}>
                      Trig ₹{Number(item.triggerPrice).toFixed(1)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Ionicons
              name={
                isExecuted ? 'checkmark-circle' :
                isPending ? 'time-outline' :
                status === 'CANCELLED' ? 'close-circle-outline' : 'alert-circle-outline'
              }
              size={13}
              color={statusColor}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
          </View>
        </View>

        {/* Exact Time Row: PROMINENTLY SHOWS EXACT TIME WITH SECONDS */}
        <View style={styles.timestampRow}>
          <Ionicons name="time-outline" size={13} color="#64748B" style={{ marginRight: 5 }} />
          <Text style={styles.timestampText}>
            {isExecuted ? 'Executed at: ' : 'Placed at: '}
            <Text style={styles.timestampHighlight}>{exactTime}</Text>
          </Text>
        </View>

        {/* Details Row: Qty, Price, Total Value */}
        <View style={styles.detailsRow}>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Quantity</Text>
            <Text style={styles.detailValue}>{orderQty}</Text>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Price</Text>
            <Text style={styles.detailValue}>₹{orderPrice.toFixed(2)}</Text>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Order Value</Text>
            <Text style={[styles.detailValue, { fontWeight: '700' }]}>
              ₹{orderTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* Rejection notice if present */}
        {item.status === 'REJECTED' && item.rejectionReason && (
          <View style={styles.rejectionBox}>
            <Ionicons name="information-circle-outline" size={14} color="#DC2626" />
            <Text style={styles.rejectionText} numberOfLines={2}>{item.rejectionReason}</Text>
          </View>
        )}

        {/* Action Buttons Row */}
        {isPending ? (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.modifyBtn}
              onPress={() => setModifyOrder(item)}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={15} color={colors.primary} />
              <Text style={styles.modifyBtnText}>Modify</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => cancelOrder(item)}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={15} color="#DC2626" />
              <Text style={styles.cancelBtnText}>Cancel Order</Text>
            </TouchableOpacity>
          </View>
        ) : isExecuted ? (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.viewPortfolioBtn}
              onPress={() => navigation.navigate('Positions', { screen: 'PositionsMain' })}
              activeOpacity={0.8}
            >
              <Ionicons name="pie-chart-outline" size={14} color={colors.primary} />
              <Text style={styles.viewPortfolioText}>View in Portfolio</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  const renderBasket = ({ item }) => (
    <View style={styles.basketCard}>
      <View style={styles.basketTop}>
        <Text style={styles.basketName}>{item.name}</Text>
        {item.executed && (
          <View style={styles.basketExecutedChip}>
            <Text style={styles.basketExecutedTxt}>Executed</Text>
          </View>
        )}
      </View>
      <Text style={styles.basketLegsSummary}>
        {item.legs?.map(l => `${l.side === 'BUY' ? '+' : '−'}${l.quantity} ${l.stockSymbol}`).join('  ·  ')}
      </Text>
      {!item.executed && (
        <View style={styles.basketActions}>
          <TouchableOpacity style={styles.basketExecBtn} onPress={() => executeBasket(item)}>
            <Text style={styles.basketExecTxt}>Execute all legs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.basketDelBtn} onPress={() => deleteBasket(item)}>
            <Ionicons name="trash-outline" size={16} color={colors.loss} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Ionicons
          name={
            tab === 0 ? 'time-outline' :
            tab === 1 ? 'checkmark-done-circle-outline' :
            tab === 2 ? 'receipt-outline' : 'layers-outline'
          }
          size={44}
          color="#94A3B8"
        />
      </View>
      <Text style={styles.emptyTitle}>
        {tab === 0 ? 'No Open Orders' :
         tab === 1 ? 'No Executed Orders' :
         tab === 2 ? 'No Orders Recorded' : 'No Baskets Created'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {tab === 0
          ? 'You have no pending limit or trigger orders. Orders placed will appear here with exact timestamp.'
          : tab === 1
          ? 'Your completed trade executions with second-by-second timestamps will appear here.'
          : 'Place an order from the Option Chain or Watchlist to start trading.'}
      </Text>
      <TouchableOpacity
        style={styles.exploreBtn}
        onPress={() => navigation.navigate('Watchlist')}
        activeOpacity={0.85}
      >
        <Text style={styles.exploreBtnText}>Explore Market</Text>
      </TouchableOpacity>
    </View>
  );

  const currentData = getFilteredData();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Index ticker */}
      <IndexTicker
        indexes={{}}
        onIndexPress={(name) => navigation.navigate('IndexChart', { indexName: name })}
      />

      {/* Header title & search icon */}
      <View style={styles.titleBar}>
        <View>
          <Text style={styles.screenTitle}>Orders</Text>
          <Text style={styles.screenSubtitle}>Live order book & trade executions</Text>
        </View>
        <TouchableOpacity
          style={styles.searchToggleBtn}
          onPress={() => setShowSearch(!showSearch)}
          activeOpacity={0.7}
        >
          <Ionicons name={showSearch ? 'close' : 'search-outline'} size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search Input Bar if toggled */}
      {showSearch && (
        <View style={styles.searchBarWrap}>
          <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by symbol, type, product..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Top Segmented Tabs */}
      <View style={styles.tabContainer}>
        {TOP_TABS.map((t, idx) => {
          const isActive = tab === idx;
          const badgeCount =
            idx === 0 ? openOrdersCount :
            idx === 1 ? executedOrdersCount : null;

          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.segmentTab, isActive && styles.segmentTabActive]}
              onPress={() => setTab(idx)}
              activeOpacity={0.75}
            >
              <Text style={[styles.segmentTabText, isActive && styles.segmentTabTextActive]}>
                {t.label}
              </Text>
              {badgeCount !== null && badgeCount > 0 && (
                <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
                  <Text style={[styles.countBadgeText, isActive && styles.countBadgeTextActive]}>
                    {badgeCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List content with swipe gesture */}
      <Animated.View style={{ flex: 1, opacity: contentAnim }} {...panHandlers}>
        <FlatList
          data={currentData}
          keyExtractor={(item, i) => item._id ?? String(i)}
          renderItem={tab === 3 ? renderBasket : renderOrder}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 110, paddingHorizontal: 16, paddingTop: 8 }}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData();
              }}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={<EmptyState />}
        />
      </Animated.View>

      <ModifyOrderSheet
        order={modifyOrder}
        onClose={() => setModifyOrder(null)}
        onSaved={fetchData}
      />
      <BasketBuilderModal
        visible={basketBuilderOpen}
        onClose={() => setBasketBuilderOpen(false)}
        onSaved={fetchData}
      />
    </View>
  );
}

// ─── Modify a resting PENDING order (price / qty / trigger) ──────────────────
function ModifyOrderSheet({ order, onClose, onSaved }) {
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (order) {
      setQty(String(order.quantity ?? order.qty ?? '1'));
      setPrice(String(order.price ?? ''));
      setTriggerPrice(order.triggerPrice != null ? String(order.triggerPrice) : '');
    }
  }, [order]);

  const save = async () => {
    if (!order) return;
    setSaving(true);
    try {
      await api.modifyOrder(order._id, {
        qty: Number(qty),
        price: Number(price),
        triggerPrice: triggerPrice ? Number(triggerPrice) : undefined,
      });
      onSaved?.();
      onClose();
      Alert.alert('Order Modified', 'Your order parameters have been updated.');
    } catch (e) {
      Alert.alert('Modification Error', e.message || 'Failed to modify order.');
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Modal visible={!!order} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBackdrop}
      >
        <View style={[styles.modalCard, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Modify Order</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSub}>{order.stockSymbol || order.symbol} · {order.productType || 'NRML'}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Quantity</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={qty}
              onChangeText={setQty}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Limit Price (₹)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
            />
          </View>

          {order.type === 'SL' || order.type === 'SLM' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Trigger Price (₹)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={triggerPrice}
                onChangeText={setTriggerPrice}
              />
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Update Order</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Basket Builder Modal ───────────────────────────────────────────────────
function BasketBuilderModal({ visible, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [legs, setLegs] = useState([]);
  const [symbol, setSymbol] = useState('');
  const [qty, setQty] = useState('1');
  const [side, setSide] = useState('BUY');

  const addLeg = () => {
    if (!symbol.trim()) return;
    setLegs([...legs, { stockSymbol: symbol.toUpperCase().trim(), quantity: Number(qty) || 1, side }]);
    setSymbol('');
    setQty('1');
  };

  const createBasket = async () => {
    if (!name.trim() || legs.length === 0) {
      Alert.alert('Incomplete Basket', 'Provide a basket name and at least one order leg.');
      return;
    }
    try {
      await api.createBasket(name.trim(), legs);
      onSaved?.();
      onClose();
      setName('');
      setLegs([]);
    } catch (e) {
      Alert.alert('Basket Error', e.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Order Basket</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.textInput, { marginBottom: 12 }]}
            placeholder="Basket Name (e.g. Iron Condor, Nifty Hedge)"
            value={name}
            onChangeText={setName}
          />

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <TextInput
              style={[styles.textInput, { flex: 2 }]}
              placeholder="Symbol (e.g. RELIANCE)"
              value={symbol}
              onChangeText={setSymbol}
              autoCapitalize="characters"
            />
            <TextInput
              style={[styles.textInput, { flex: 1 }]}
              placeholder="Qty"
              keyboardType="numeric"
              value={qty}
              onChangeText={setQty}
            />
            <TouchableOpacity
              style={[styles.sideToggleBtn, { backgroundColor: side === 'BUY' ? '#DCFCE7' : '#FEE2E2' }]}
              onPress={() => setSide(s => (s === 'BUY' ? 'SELL' : 'BUY'))}
            >
              <Text style={{ fontWeight: '700', color: side === 'BUY' ? '#16A34A' : '#DC2626' }}>
                {side}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addLegBtn} onPress={addLeg}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 150, marginBottom: 14 }}>
            {legs.map((l, idx) => (
              <View key={idx} style={styles.legItem}>
                <Text style={{ fontWeight: '700', color: l.side === 'BUY' ? '#16A34A' : '#DC2626' }}>
                  {l.side} {l.quantity}x {l.stockSymbol}
                </Text>
                <TouchableOpacity onPress={() => setLegs(legs.filter((_, i) => i !== idx))}>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={createBasket}>
            <Text style={styles.saveBtnText}>Save Basket</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  searchToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  segmentTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  segmentTabActive: {
    backgroundColor: colors.primary,
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  countBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  countBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  countBadgeTextActive: {
    color: colors.primary,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  sideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },
  sideBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  stockSymbol: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 5,
  },
  pillTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  pillTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  timestampText: {
    fontSize: 12,
    color: '#64748B',
  },
  timestampHighlight: {
    color: '#0F172A',
    fontWeight: '700',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detailCol: {
    flex: 1,
  },
  detailDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },
  detailLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  rejectionText: {
    fontSize: 11,
    color: '#DC2626',
    flex: 1,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 10,
  },
  modifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    gap: 4,
  },
  modifyBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    gap: 4,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  viewPortfolioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    gap: 4,
  },
  viewPortfolioText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  exploreBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  exploreBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  basketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  basketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  basketName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  basketExecutedChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#DCFCE7',
  },
  basketExecutedTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  basketLegsSummary: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
  },
  basketActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  basketExecBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  basketExecTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  basketDelBtn: {
    padding: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  saveBtn: {
    backgroundColor: colors.primary,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sideToggleBtn: {
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLegBtn: {
    backgroundColor: colors.primary,
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
});
