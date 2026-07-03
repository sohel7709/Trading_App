import React, { useState, useCallback } from 'react';
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
  const [baskets, setBaskets] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tradebook, setTradebook] = useState(false);
  const [modifyOrder, setModifyOrder] = useState(null); // order being edited
  const [basketBuilderOpen, setBasketBuilderOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const { panHandlers, contentAnim } = useSwipeTabs({
    tabCount: TOP_TABS.length,
    tab,
    onTabChange: setTab,
  });

  const fetchData = async () => {
    try {
      const [o, t, b] = await Promise.all([api.getOrders(), api.getTrades(), api.getBaskets()]);
      setOrders(o);
      setTrades(t);
      setBaskets(b);
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

  const executeBasket = async (basket) => {
    try {
      const res = await api.executeBasket(basket._id);
      const failed = res.results.filter(r => r.status === 'failed');
      Alert.alert(
        'Basket executed',
        failed.length
          ? `${res.results.length - failed.length}/${res.results.length} legs placed.\nFailed: ${failed.map(f => `${f.stockSymbol} (${f.error})`).join(', ')}`
          : `All ${res.results.length} legs placed.`
      );
      fetchData();
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const deleteBasket = (basket) => {
    Alert.alert('Delete basket', `Delete "${basket.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api.deleteBasket(basket._id); fetchData(); } },
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
    const isPending = item.status === 'PENDING';

    return (
      <TouchableOpacity
        style={styles.orderCard}
        activeOpacity={isPending ? 0.6 : 1}
        onPress={() => isPending && setModifyOrder(item)}
      >
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
              <Text style={styles.orderMeta}>
                {item.productType} · {item.type ?? 'MKT'}
                {item.triggerPrice ? ` · Trig ₹${item.triggerPrice}` : ''}
                {item.isCoverOrder ? ' · CO' : ''}
              </Text>
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

          {item.status === 'REJECTED' && item.rejectionReason && (
            <Text style={styles.rejectionText} numberOfLines={1}>{item.rejectionReason}</Text>
          )}

          {isPending && (
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

  const renderBasket = ({ item }) => (
    <View style={styles.basketCard}>
      <View style={styles.basketTop}>
        <Text style={styles.basketName}>{item.name}</Text>
        {item.executed && <View style={styles.basketExecutedChip}><Text style={styles.basketExecutedTxt}>Executed</Text></View>}
      </View>
      <Text style={styles.basketLegsSummary}>
        {item.legs.map(l => `${l.side === 'BUY' ? '+' : '−'}${l.quantity} ${l.stockSymbol}`).join('  ·  ')}
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

  const data = tab === 3 ? baskets : getTabData();

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
            onPress={() => t === 'GTT' ? navigation.navigate('GTT') : setTab(i)}
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
        {tab === 3 ? (
          <TouchableOpacity style={styles.newBasketBtn} onPress={() => setBasketBuilderOpen(true)}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.newBasketTxt}>New basket</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.tradebookToggle}
            onPress={() => setTradebook(!tradebook)}
          >
            <View style={[styles.toggleCircle, tradebook && styles.toggleCircleActive]} />
            <Text style={styles.tradebookText}>Tradebook</Text>
          </TouchableOpacity>
        )}
      </View>

      <Animated.View style={{ flex: 1, opacity: contentAnim }} {...panHandlers}>
        <FlatList
          data={data}
          keyExtractor={(item, i) => item._id ?? String(i)}
          renderItem={tab === 3 ? renderBasket : renderOrder}
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

      <ModifyOrderSheet order={modifyOrder} onClose={() => setModifyOrder(null)} onSaved={fetchData} />
      <BasketBuilderModal visible={basketBuilderOpen} onClose={() => setBasketBuilderOpen(false)} onSaved={fetchData} />
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

  React.useEffect(() => {
    if (order) {
      setQty(String(order.quantity));
      setPrice(String(order.price));
      setTriggerPrice(order.triggerPrice != null ? String(order.triggerPrice) : '');
    }
  }, [order]);

  const save = async () => {
    if (!order) return;
    setSaving(true);
    try {
      await api.modifyOrder(order._id, {
        qty: Number(qty), price: Number(price),
        triggerPrice: triggerPrice ? Number(triggerPrice) : undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Modify failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!order} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
        {order && (
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Modify {order.stockSymbol}</Text>
            <Text style={styles.modalSubtitle}>{order.type} · {order.side}</Text>

            <Text style={styles.modalFieldLabel}>Quantity</Text>
            <TextInput style={styles.modalInput} value={qty} onChangeText={setQty} keyboardType="numeric" />

            <Text style={styles.modalFieldLabel}>Price</Text>
            <TextInput style={styles.modalInput} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

            {order.type !== 'LIMIT' && (
              <>
                <Text style={styles.modalFieldLabel}>Trigger price</Text>
                <TextInput style={styles.modalInput} value={triggerPrice} onChangeText={setTriggerPrice} keyboardType="decimal-pad" />
              </>
            )}

            <TouchableOpacity style={styles.modalSaveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveTxt}>Save changes</Text>}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Build a multi-leg basket order ───────────────────────────────────────────
function BasketBuilderModal({ visible, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [legs, setLegs] = useState([]);
  const [symbol, setSymbol] = useState('');
  const [qty, setQty] = useState('1');
  const [legSide, setLegSide] = useState('BUY');
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(''); setLegs([]); setSymbol(''); setQty('1'); setLegSide('BUY'); };

  const addLeg = () => {
    if (!symbol.trim() || !qty || Number(qty) <= 0) {
      Alert.alert('Missing details', 'Enter a symbol and quantity');
      return;
    }
    setLegs(prev => [...prev, {
      stockSymbol: symbol.trim().toUpperCase(), quantity: Number(qty),
      side: legSide, type: 'MARKET', price: 0, productType: 'CNC',
    }]);
    setSymbol(''); setQty('1');
  };

  const removeLeg = (i) => setLegs(prev => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Give this basket a name'); return; }
    if (legs.length === 0) { Alert.alert('Add legs', 'Add at least one leg to the basket'); return; }
    setSaving(true);
    try {
      // MARKET legs need a reference price — pull live quotes just before saving
      const withPrices = await Promise.all(legs.map(async (l) => {
        try {
          const q = await api.getQuote(l.stockSymbol);
          return { ...l, price: q.ltp };
        } catch { return l; }
      }));
      await api.createBasket(name.trim(), withPrices);
      onSaved();
      reset();
      onClose();
    } catch (e) {
      Alert.alert('Failed to save basket', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>New basket</Text>

          <TextInput
            style={styles.modalInput}
            placeholder="Basket name"
            placeholderTextColor="#9AA4AB"
            value={name}
            onChangeText={setName}
          />

          <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
            {legs.map((l, i) => (
              <View key={i} style={styles.legRow}>
                <Text style={[styles.legSide, { color: l.side === 'BUY' ? colors.gain : colors.loss }]}>{l.side}</Text>
                <Text style={styles.legTxt}>{l.quantity} × {l.stockSymbol}</Text>
                <TouchableOpacity onPress={() => removeLeg(i)}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={styles.legBuilderRow}>
            <TouchableOpacity
              style={[styles.legSideToggle, { backgroundColor: legSide === 'BUY' ? colors.gainLight : colors.lossLight }]}
              onPress={() => setLegSide(s => s === 'BUY' ? 'SELL' : 'BUY')}
            >
              <Text style={{ color: legSide === 'BUY' ? colors.gain : colors.loss, fontWeight: '700', fontSize: 12 }}>{legSide}</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.modalInput, { flex: 2, marginBottom: 0 }]}
              placeholder="Symbol"
              placeholderTextColor="#9AA4AB"
              value={symbol}
              onChangeText={setSymbol}
              autoCapitalize="characters"
            />
            <TextInput
              style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
              placeholder="Qty"
              placeholderTextColor="#9AA4AB"
              value={qty}
              onChangeText={setQty}
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.legAddBtn} onPress={addLeg}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.modalSaveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveTxt}>Save basket ({legs.length} legs)</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  newBasketBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  newBasketTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

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
  rejectionText: { fontSize: 11, color: colors.loss, flexShrink: 1 },
  cancelBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.loss,
  },
  cancelText: { fontSize: 12, color: colors.loss, fontWeight: '600' },

  // ── Basket cards ──────────────────────────────────────────────────────────
  basketCard: {
    backgroundColor: colors.surface,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 6,
  },
  basketTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  basketName: { fontSize: 15, fontWeight: '700', color: colors.text },
  basketExecutedChip: { backgroundColor: colors.gainLight, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  basketExecutedTxt: { fontSize: 10, fontWeight: '700', color: colors.gain },
  basketLegsSummary: { fontSize: 12, color: colors.textSecondary },
  basketActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  basketExecBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 9, alignItems: 'center' },
  basketExecTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  basketDelBtn: { width: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.loss, justifyContent: 'center', alignItems: 'center' },

  // ── Shared modal (modify order / basket builder) ────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  modalSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: 14 },
  modalFieldLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 6, marginTop: 10 },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text,
    marginBottom: 10,
  },
  modalSaveBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  modalSaveTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  legRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  legSide: { fontSize: 11, fontWeight: '800', width: 36 },
  legTxt: { flex: 1, fontSize: 13, color: colors.text },
  legBuilderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  legSideToggle: { width: 56, height: 42, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  legAddBtn: { width: 42, height: 42, borderRadius: 8, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },

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
