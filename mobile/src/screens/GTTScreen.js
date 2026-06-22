import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, RefreshControl, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import IndexTicker from '../components/IndexTicker';

const TRIGGER_TYPES = ['Single', 'OCO'];
const SIDES = ['BUY', 'SELL'];

// ─── Status badge helper ──────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    ACTIVE:    { bg: colors.gainLight,    text: colors.gain },
    TRIGGERED: { bg: colors.warningLight, text: colors.warning },
    CANCELLED: { bg: '#F1F3F4',           text: colors.textMuted },
  };
  const s = map[status] ?? map.ACTIVE;
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
      <Text style={[styles.statusText, { color: s.text }]}>{status}</Text>
    </View>
  );
}

// ─── GTT order row ────────────────────────────────────────────────────────────
function GTTRow({ item, onDelete }) {
  const isBuy = item.gttMeta?.side !== 'SELL';
  const sideColor = isBuy ? colors.gain : colors.loss;

  return (
    <View style={styles.gttRow}>
      {/* Top: symbol + side badge + status badge + delete */}
      <View style={styles.gttRowTop}>
        <View style={[styles.sidePill, { backgroundColor: isBuy ? colors.gainLight : colors.lossLight }]}>
          <Text style={[styles.sidePillText, { color: sideColor }]}>
            {isBuy ? 'BUY' : 'SELL'}
          </Text>
        </View>
        <Text style={styles.gttSymbol}>{item.stockSymbol}</Text>
        <View style={{ flex: 1 }} />
        <StatusBadge status="ACTIVE" />
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(item._id, item.stockSymbol)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Bottom: trigger / limit / qty data pills */}
      <View style={styles.gttRowBottom}>
        <View style={styles.gttDataCell}>
          <Text style={styles.gttDataLabel}>Trigger</Text>
          <Text style={styles.gttDataValue}>
            ₹{Number(item.targetPrice ?? 0).toFixed(2)}
          </Text>
        </View>
        <View style={styles.gttCellDivider} />
        <View style={styles.gttDataCell}>
          <Text style={styles.gttDataLabel}>Limit</Text>
          <Text style={styles.gttDataValue}>
            ₹{Number(item.gttMeta?.limitPrice ?? item.targetPrice ?? 0).toFixed(2)}
          </Text>
        </View>
        <View style={styles.gttCellDivider} />
        <View style={styles.gttDataCell}>
          <Text style={styles.gttDataLabel}>Qty</Text>
          <Text style={styles.gttDataValue}>{item.gttMeta?.qty ?? 1}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function GTTScreen({ navigation }) {
  const [gttOrders,    setGttOrders]    = useState([]);
  const [refreshing,   setRefreshing]   = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [filterTab,    setFilterTab]    = useState('Single');
  const [triggerType,  setTriggerType]  = useState('Single');
  const [side,         setSide]         = useState('BUY');
  const [symbol,       setSymbol]       = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [limitPrice,   setLimitPrice]   = useState('');
  const [qty,          setQty]          = useState('1');
  const [searchResults, setSearchResults] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const insets = useSafeAreaInsets();

  // ── Data fetching (api.getAlerts used as proxy) ────────────────────────────
  const fetchGTT = useCallback(async () => {
    try {
      const res = await api.getAlerts();
      setGttOrders((res || []).filter(a => a.gtt));
    } catch {}
    finally { setRefreshing(false); }
  }, []);

  const searchStock = async (q) => {
    setSymbol(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const res = await api.searchStocks(q);
      setSearchResults((res || []).slice(0, 6));
    } catch {}
  };

  const createGTT = async () => {
    if (!symbol || !triggerPrice || !qty) {
      return Alert.alert('Required', 'Fill symbol, trigger price and quantity');
    }
    setLoading(true);
    try {
      await api.createAlert({
        stockSymbol: symbol,
        targetPrice: Number(triggerPrice),
        condition: side === 'BUY' ? 'BELOW' : 'ABOVE',
        gtt: true,
        gttMeta: { side, qty: Number(qty), limitPrice: Number(limitPrice || triggerPrice) },
      });
      setSheetVisible(false);
      resetForm();
      fetchGTT();
      Alert.alert('GTT Created', `GTT order set for ${symbol}`);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  const deleteGTT = (id, sym) => {
    Alert.alert('Delete GTT', `Delete GTT order for ${sym}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await api.deleteAlert(id); fetchGTT(); },
      },
    ]);
  };

  const resetForm = () => {
    setSymbol(''); setTriggerPrice(''); setLimitPrice(''); setQty('1');
    setSearchResults([]); setSide('BUY'); setTriggerType('Single');
  };

  // Filter displayed orders by tab
  const displayed = gttOrders.filter(o =>
    filterTab === 'OCO' ? o.gttMeta?.type === 'OCO' : o.gttMeta?.type !== 'OCO',
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>GTT</Text>
        <TouchableOpacity style={styles.headerAdd} onPress={() => setSheetVisible(true)}>
          <Text style={styles.headerAddText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* ── Index ticker ───────────────────────────────────────────────────── */}
      <IndexTicker navigation={navigation} />

      {/* ── Filter tabs: Single | OCO ──────────────────────────────────────── */}
      <View style={styles.tabRow}>
        {TRIGGER_TYPES.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, filterTab === t && styles.tabActive]}
            onPress={() => setFilterTab(t)}
          >
            <Text style={[styles.tabText, filterTab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── GTT list ───────────────────────────────────────────────────────── */}
      <FlatList
        data={displayed}
        keyExtractor={(item, i) => item._id ?? String(i)}
        renderItem={({ item }) => <GTTRow item={item} onDelete={deleteGTT} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchGTT(); }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="flash-outline" size={52} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No GTT orders</Text>
            <Text style={styles.emptyText}>
              Good Till Triggered orders execute automatically when the market reaches your price.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setSheetVisible(true)}>
              <Text style={styles.emptyBtnText}>Create GTT</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* ── Create GTT bottom sheet ─────────────────────────────────────────── */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setSheetVisible(false); resetForm(); }}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.overlayBg}
            onPress={() => { setSheetVisible(false); resetForm(); }}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Create GTT</Text>
              <TouchableOpacity onPress={() => { setSheetVisible(false); resetForm(); }}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Single / OCO segmented */}
              <View style={styles.segmented}>
                {TRIGGER_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.segBtn, triggerType === t && styles.segBtnActive]}
                    onPress={() => setTriggerType(t)}
                  >
                    <Text style={[styles.segBtnText, triggerType === t && styles.segBtnTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* BUY / SELL */}
              <View style={styles.bsRow}>
                {SIDES.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.bsBtn,
                      side === s && (s === 'BUY' ? styles.bsBtnBuy : styles.bsBtnSell),
                    ]}
                    onPress={() => setSide(s)}
                  >
                    <Text style={[styles.bsBtnText, side === s && styles.bsBtnTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Instrument */}
              <Text style={styles.fieldLabel}>Instrument</Text>
              <View style={styles.inputRow}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.inputFlex}
                  placeholder="Search symbol"
                  placeholderTextColor={colors.textMuted}
                  value={symbol}
                  onChangeText={searchStock}
                  autoCapitalize="characters"
                />
              </View>
              {searchResults.length > 0 && (
                <View style={styles.suggestions}>
                  {searchResults.map(s => (
                    <TouchableOpacity
                      key={s.symbol}
                      style={styles.suggestion}
                      onPress={() => { setSymbol(s.symbol); setSearchResults([]); }}
                    >
                      <Text style={styles.suggSymbol}>{s.symbol}</Text>
                      <Text style={styles.suggName} numberOfLines={1}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Trigger price */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Trigger price (₹)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                value={triggerPrice}
                onChangeText={setTriggerPrice}
              />

              {/* Limit price */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Limit price (₹)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                value={limitPrice}
                onChangeText={setLimitPrice}
              />

              {/* Quantity */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Quantity</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQty(q => String(Math.max(1, Number(q) - 1)))}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="numeric"
                  value={qty}
                  onChangeText={v => setQty(v.replace(/[^0-9]/g, ''))}
                  textAlign="center"
                />
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQty(q => String(Number(q) + 1))}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  (!symbol || !triggerPrice) && styles.submitBtnDisabled,
                ]}
                onPress={createGTT}
                disabled={loading || !symbol || !triggerPrice}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>Create GTT</Text>
                }
              </TouchableOpacity>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBack:    { padding: 4, marginRight: 8 },
  headerTitle:   { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  headerAdd:     { padding: 4 },
  headerAddText: { fontSize: 24, fontWeight: '400', color: colors.primary, lineHeight: 26 },

  // Filter tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: colors.primary },
  tabText:       { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },

  // List
  listContent: { paddingBottom: 80 },

  // GTT row
  gttRow: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gttRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  sidePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  sidePillText: { fontSize: 11, fontWeight: '800' },
  gttSymbol:    { fontSize: 14, fontWeight: '700', color: colors.text },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  deleteBtn:    { padding: 4, marginLeft: 6 },

  gttRowBottom: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surfaceLight,
  },
  gttDataCell:    { flex: 1, paddingVertical: 10, alignItems: 'center' },
  gttCellDivider: { width: 1, backgroundColor: colors.border, marginVertical: 6 },
  gttDataLabel:   { fontSize: 11, color: colors.textMuted, marginBottom: 3 },
  gttDataValue:   { fontSize: 13, fontWeight: '600', color: colors.text },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  emptyText:  { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn:   { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Sheet
  overlay:   { flex: 1, justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingTop: 10,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },

  // Segmented control
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 14,
  },
  segBtn:         { flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.surfaceLight },
  segBtnActive:   { backgroundColor: colors.surface },
  segBtnText:     { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  segBtnTextActive: { color: colors.text, fontWeight: '700' },

  // BUY/SELL toggle
  bsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  bsBtn:         { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.surfaceLight },
  bsBtnBuy:      { backgroundColor: colors.gain },
  bsBtnSell:     { backgroundColor: colors.loss },
  bsBtnText:     { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  bsBtnTextActive: { color: '#fff' },

  // Form
  fieldLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500', marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  inputFlex: { flex: 1, fontSize: 15, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  suggestions: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggSymbol: { fontSize: 13, fontWeight: '700', color: colors.primary, width: 90 },
  suggName:   { flex: 1, fontSize: 12, color: colors.textSecondary },

  // Qty stepper
  qtyRow: { flexDirection: 'row', alignItems: 'center' },
  qtyBtn: {
    width: 44, height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
  },
  qtyBtnText: { fontSize: 20, color: colors.text },
  qtyInput: {
    flex: 1,
    height: 48,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },

  // Submit
  submitBtn: {
    marginTop: 20,
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#9CA3AF' },
  submitBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});
