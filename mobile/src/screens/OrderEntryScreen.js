import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api } from '../api/client';

const ORDER_TYPES = ['Regular', 'MTF', 'Iceberg', 'Cover'];
const PRODUCT_TYPES = ['CNC', 'MIS', 'NRML'];
const PRICE_MODES = ['Market', 'Limit', 'SL', 'SL-M'];

export default function OrderEntryScreen({ route, navigation }) {
  const { symbol, ltp = 0, defaultSide = 'BUY' } = route.params || {};
  const insets = useSafeAreaInsets();

  const [side, setSide] = useState(defaultSide);
  const [exchange, setExchange] = useState('NSE');
  const [orderType, setOrderType] = useState('Regular');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState(Number(ltp).toFixed(2));
  const [triggerPrice, setTriggerPrice] = useState('');
  const [priceMode, setPriceMode] = useState('Limit');
  const [productType, setProductType] = useState('CNC');
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState(null);

  const nsePrice = Number(ltp);
  const bsePrice = Math.round((nsePrice - (nsePrice * 0.0001 + 0.50)) * 100) / 100;
  const currentExchangePrice = exchange === 'NSE' ? nsePrice : bsePrice;

  useEffect(() => {
    api.getWallet().then(setWallet).catch(() => {});
  }, []);

  useEffect(() => {
    if (ltp > 0) setPrice(Number(ltp).toFixed(2));
  }, [ltp]);

  const handlePlaceOrder = async () => {
    const qty = Number(quantity);
    const isMarket = priceMode === 'Market';
    const p = isMarket ? currentExchangePrice : Number(price);

    if (!qty || qty <= 0) { Alert.alert('Invalid quantity'); return; }
    if (!isMarket && (!p || p <= 0)) { Alert.alert('Invalid price'); return; }

    setLoading(true);
    try {
      await api.placeOrder({
        stockSymbol: symbol,
        qty,
        price: p,
        mode: priceMode === 'Market' ? 'MARKET' : 'LIMIT',
        side,
        productType,
      });

      Alert.alert(
        side === 'BUY' ? 'Order placed' : 'Sell order placed',
        `${side} ${qty} × ${symbol} @ ₹${p.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` +
        (productType === 'MIS' ? '\nWill appear in Positions.' : '\nWill appear in Holdings.'),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Order failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const isBuy = side === 'BUY';
  const accentColor = isBuy ? '#25B87E' : '#E64D3D';
  const qty = Number(quantity || 0);
  const isMarket = priceMode === 'Market';
  const isSLMode = priceMode === 'SL' || priceMode === 'SL-M';
  const effectivePrice = isMarket ? currentExchangePrice : Number(price || 0);
  const totalAmt = qty * effectivePrice;
  const charges = Math.max(0.01, Math.round(totalAmt * 0.0005 * 100) / 100);
  const available = Number(wallet?.availableMargin ?? 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#1E1E1E" />
        </TouchableOpacity>

        <Text style={styles.headerSymbol}>{symbol}</Text>

        {/* Exchange pills */}
        <View style={styles.exchangePills}>
          {['NSE', 'BSE'].map(ex => (
            <TouchableOpacity
              key={ex}
              style={[styles.exchangePill, exchange === ex && styles.exchangePillActive]}
              onPress={() => setExchange(ex)}
              activeOpacity={0.7}
            >
              <Text style={[styles.exchangePillText, exchange === ex && styles.exchangePillTextActive]}>
                {ex}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── BUY / SELL Switcher ── */}
      <View style={styles.sideSwitcher}>
        <TouchableOpacity
          style={[styles.sideBtn, isBuy && styles.sideBtnBuyActive]}
          onPress={() => setSide('BUY')}
          activeOpacity={0.85}
        >
          <Text style={[styles.sideBtnText, isBuy ? styles.sideBtnTextActive : { color: '#25B87E' }]}>
            BUY
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sideBtn, !isBuy && styles.sideBtnSellActive]}
          onPress={() => setSide('SELL')}
          activeOpacity={0.85}
        >
          <Text style={[styles.sideBtnText, !isBuy ? styles.sideBtnTextActive : { color: '#E64D3D' }]}>
            SELL
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Order type tabs ── */}
        <View style={styles.tabBar}>
          {ORDER_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              style={styles.tabItem}
              onPress={() => setOrderType(t)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, orderType === t && styles.tabTextActive]}>{t}</Text>
              {orderType === t && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Product type: CNC / MIS / NRML ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Product</Text>
          <View style={styles.segmentControl}>
            {PRODUCT_TYPES.map(pt => (
              <TouchableOpacity
                key={pt}
                style={[styles.segmentItem, productType === pt && styles.segmentItemActive]}
                onPress={() => setProductType(pt)}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, productType === pt && styles.segmentTextActive]}>
                  {pt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Price mode: Market / Limit / SL / SL-M ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Order</Text>
          <View style={styles.segmentControl}>
            {PRICE_MODES.map(pm => (
              <TouchableOpacity
                key={pm}
                style={[styles.segmentItem, priceMode === pm && styles.segmentItemActive]}
                onPress={() => setPriceMode(pm)}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, priceMode === pm && styles.segmentTextActive]}>
                  {pm}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Quantity field ── */}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Qty</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setQuantity(q => String(Math.max(1, Number(q) - 1)))}
              activeOpacity={0.7}
            >
              <Ionicons name="remove" size={18} color="#387ED1" />
            </TouchableOpacity>
            <TextInput
              style={styles.qtyInput}
              value={quantity}
              onChangeText={v => setQuantity(v.replace(/[^0-9]/g, '') || '1')}
              keyboardType="numeric"
              textAlign="center"
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setQuantity(q => String(Number(q) + 1))}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={18} color="#387ED1" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Price field ── */}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Price</Text>
          {isMarket ? (
            <View style={[styles.priceInput, styles.priceInputDisabled]}>
              <Text style={styles.priceInputMuted}>Market price</Text>
            </View>
          ) : (
            <TextInput
              style={styles.priceInput}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
          )}
        </View>

        {/* ── Trigger price (SL / SL-M only) ── */}
        {isSLMode && (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Trigger Price</Text>
            <TextInput
              style={styles.priceInput}
              value={triggerPrice}
              onChangeText={setTriggerPrice}
              keyboardType="decimal-pad"
              selectTextOnFocus
              placeholder="0.00"
              placeholderTextColor="#B3BBBF"
            />
          </View>
        )}

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Summary rows ── */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Available margin</Text>
          <Text style={styles.summaryValueBlue}>
            ₹{available.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Estimated value</Text>
          <Text style={styles.summaryValue}>
            ₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Charges</Text>
          <Text style={styles.summaryValueMuted}>₹{charges.toFixed(2)}</Text>
        </View>
      </ScrollView>

      {/* ── Footer: Place Order button ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[styles.placeOrderBtn, { backgroundColor: accentColor }]}
          onPress={handlePlaceOrder}
          activeOpacity={0.88}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.placeOrderText}>
              {side} · {qty} {qty === 1 ? 'share' : 'shares'} · ₹
              {totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },

  // ── Header ──
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerBtn: { padding: 4, width: 36 },
  headerSymbol: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1E1E',
    textAlign: 'center',
  },
  exchangePills: { flexDirection: 'row', gap: 6 },
  exchangePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  exchangePillActive: {
    backgroundColor: '#387ED1',
    borderColor: '#387ED1',
  },
  exchangePillText: { fontSize: 11, fontWeight: '600', color: '#738390' },
  exchangePillTextActive: { color: '#FFFFFF' },

  // ── BUY / SELL switcher ──
  sideSwitcher: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  sideBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  sideBtnBuyActive: { backgroundColor: '#25B87E' },
  sideBtnSellActive: { backgroundColor: '#E64D3D' },
  sideBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  sideBtnTextActive: { color: '#FFFFFF' },

  scroll: { paddingBottom: 24 },

  // ── Order type tabs ──
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    position: 'relative',
  },
  tabText: { fontSize: 13, color: '#738390', fontWeight: '500' },
  tabTextActive: { color: '#387ED1', fontWeight: '700' },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#387ED1',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // ── Segmented controls ──
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  sectionLabel: {
    fontSize: 13,
    color: '#738390',
    width: 60,
  },
  segmentControl: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F1F3F4',
    borderRadius: 8,
    padding: 2,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: 12, fontWeight: '500', color: '#738390' },
  segmentTextActive: { color: '#1E1E1E', fontWeight: '600' },

  // ── Input fields ──
  fieldBlock: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  fieldLabel: { fontSize: 11, color: '#738390', marginBottom: 6 },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#1E1E1E',
    backgroundColor: '#FFFFFF',
  },

  priceInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1E1E1E',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  priceInputDisabled: { backgroundColor: '#F1F3F4' },
  priceInputMuted: { fontSize: 15, color: '#B3BBBF' },

  // ── Divider ──
  divider: {
    height: 8,
    backgroundColor: '#F1F3F4',
  },

  // ── Summary rows ──
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  summaryLabel: { fontSize: 14, color: '#738390' },
  summaryValueBlue: { fontSize: 14, fontWeight: '600', color: '#387ED1' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#1E1E1E' },
  summaryValueMuted: { fontSize: 13, color: '#B3BBBF' },

  // ── Footer ──
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  placeOrderBtn: {
    height: 52,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeOrderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
