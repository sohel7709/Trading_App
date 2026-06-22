import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api } from '../api/client';

const PRODUCT_TYPES = [
  { label: 'CNC', desc: 'Delivery' },
  { label: 'MIS', desc: 'Intraday' },
  { label: 'NRML', desc: 'Normal' },
];

const ORDER_TYPES = ['Market', 'Limit', 'SL', 'SL-M'];

export default function BuySellModal({ visible, onClose, stock, defaultSide = 'BUY' }) {
  const [side, setSide] = useState(defaultSide);
  const [productType, setProductType] = useState(stock?.productType || 'CNC');
  const [orderType, setOrderType] = useState('Market');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [loading, setLoading] = useState(false);

  const ltp = stock?.ltp ?? 0;
  const symbol = stock?.symbol || stock?.stockSymbol || '';
  const isMarket = orderType === 'Market' || orderType === 'SL-M';
  const showTrigger = orderType === 'SL' || orderType === 'SL-M';
  const effectivePrice = isMarket ? ltp : Number(price) || ltp;
  const totalValue = (Number(qty) || 0) * effectivePrice;

  useEffect(() => {
    setSide(defaultSide);
    setProductType(stock?.productType || 'CNC');
    setOrderType('Market');
    setQty('1');
    setPrice('');
    setTriggerPrice('');
  }, [visible, defaultSide, stock?.productType]);

  useEffect(() => {
    if (orderType !== 'Market' && orderType !== 'SL-M') {
      setPrice(ltp > 0 ? Number(ltp).toFixed(2) : '');
    } else {
      setPrice('');
    }
  }, [orderType, ltp]);

  const adjustQty = (delta) => {
    setQty(prev => String(Math.max(1, (Number(prev) || 1) + delta)));
  };

  const handleOrder = async () => {
    const numQty = Number(qty);
    if (!numQty || numQty < 1) return Alert.alert('Error', 'Enter a valid quantity');
    if (!isMarket && !Number(price)) return Alert.alert('Error', 'Enter a valid price');

    setLoading(true);
    try {
      await api.placeOrder({
        stockSymbol: symbol,
        qty: numQty,
        price: isMarket ? ltp : Number(price),
        triggerPrice: showTrigger ? Number(triggerPrice) : undefined,
        mode: orderType.replace('-', '').toUpperCase(),
        side,
        productType,
      });
      Alert.alert(
        'Order Placed',
        `${side} ${numQty} ${symbol} @ ${isMarket ? 'Market' : '₹' + price}`,
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (e) {
      Alert.alert('Order Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const isBuy = side === 'BUY';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>

          {/* Drag Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerSymbol}>{symbol}</Text>
              <View style={styles.headerMeta}>
                <Text style={styles.headerExchange}>NSE</Text>
                <Text style={styles.headerLtp}>₹{Number(ltp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Buy / Sell Switcher */}
          <View style={styles.bsSwitcher}>
            <TouchableOpacity
              style={[styles.bsTab, isBuy && styles.bsTabBuyActive]}
              onPress={() => setSide('BUY')}
            >
              <Text style={[styles.bsTabText, isBuy && styles.bsTabTextActive]}>BUY</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bsTab, !isBuy && styles.bsTabSellActive]}
              onPress={() => setSide('SELL')}
            >
              <Text style={[styles.bsTabText, !isBuy && styles.bsTabTextActive]}>SELL</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Product Type */}
            <View style={styles.sectionRow}>
              {PRODUCT_TYPES.map(({ label, desc }) => (
                <TouchableOpacity
                  key={label}
                  style={[styles.chip, productType === label && styles.chipActive]}
                  onPress={() => setProductType(label)}
                >
                  <Text style={[styles.chipLabel, productType === label && styles.chipLabelActive]}>{label}</Text>
                  <Text style={[styles.chipDesc, productType === label && styles.chipDescActive]}>{desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Order Type */}
            <View style={styles.orderTypeRow}>
              {ORDER_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.orderTypeBtn, orderType === t && styles.orderTypeBtnActive]}
                  onPress={() => setOrderType(t)}
                >
                  <Text style={[styles.orderTypeTxt, orderType === t && styles.orderTypeTxtActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Qty Row */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Qty</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(-1)}>
                  <Text style={styles.qtyBtnTxt}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="numeric"
                  value={qty}
                  onChangeText={v => setQty(v.replace(/[^0-9]/g, ''))}
                  selectTextOnFocus
                />
                <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(1)}>
                  <Text style={styles.qtyBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Price Row */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Price (₹)</Text>
              <TextInput
                style={[styles.textInput, isMarket && styles.textInputDisabled]}
                keyboardType="decimal-pad"
                value={isMarket ? 'Market price' : price}
                onChangeText={setPrice}
                editable={!isMarket}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                selectTextOnFocus
              />
            </View>

            {/* Trigger Price (SL/SL-M) */}
            {showTrigger && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Trigger price (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="decimal-pad"
                  value={triggerPrice}
                  onChangeText={setTriggerPrice}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  selectTextOnFocus
                />
              </View>
            )}

            {/* Order Summary */}
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Estimated value</Text>
                <Text style={styles.summaryValue}>
                  ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Product</Text>
                <Text style={styles.summaryValue}>{productType}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Order type</Text>
                <Text style={styles.summaryValue}>{orderType}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Place Order Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.placeBtn, { backgroundColor: isBuy ? colors.gain : colors.loss }]}
              onPress={handleOrder}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : (
                  <Text style={styles.placeBtnText}>
                    {isBuy ? 'BUY' : 'SELL'} · {qty} {symbol}
                  </Text>
                )
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerLeft: {},
  headerSymbol: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  headerExchange: { fontSize: 12, color: colors.textMuted },
  headerLtp: { fontSize: 13, fontWeight: '600', color: colors.text },

  bsSwitcher: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  bsTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
  },
  bsTabBuyActive: { borderBottomWidth: 2, borderBottomColor: colors.gain },
  bsTabSellActive: { borderBottomWidth: 2, borderBottomColor: colors.loss },
  bsTabText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  bsTabTextActive: { color: colors.text },

  body: { paddingHorizontal: 16 },

  sectionRow: {
    flexDirection: 'row', gap: 8,
    marginTop: 16, marginBottom: 4,
  },
  chip: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 4,
    borderRadius: 6, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  chipLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  chipLabelActive: { color: colors.primary },
  chipDesc: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  chipDescActive: { color: colors.primary },

  orderTypeRow: {
    flexDirection: 'row', gap: 0,
    marginTop: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, overflow: 'hidden',
  },
  orderTypeBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center',
    backgroundColor: colors.surface,
    borderRightWidth: 1, borderRightColor: colors.border,
  },
  orderTypeBtnActive: { backgroundColor: '#fff' },
  orderTypeTxt: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  orderTypeTxtActive: { color: colors.text, fontWeight: '700' },

  field: { marginTop: 14 },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500', marginBottom: 6 },

  qtyRow: { flexDirection: 'row', alignItems: 'center' },
  qtyBtn: {
    width: 40, height: 44,
    borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 6,
  },
  qtyBtnTxt: { fontSize: 20, color: colors.text, lineHeight: 24 },
  qtyInput: {
    flex: 1, height: 44, marginHorizontal: 8,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 6, textAlign: 'center',
    fontSize: 16, fontWeight: '700', color: colors.text,
    backgroundColor: '#fff',
  },
  textInput: {
    height: 44, borderWidth: 1, borderColor: colors.border,
    borderRadius: 6, paddingHorizontal: 12,
    fontSize: 15, color: colors.text,
    backgroundColor: '#fff',
  },
  textInputDisabled: { backgroundColor: colors.surface, color: colors.textSecondary },

  summary: {
    marginTop: 16, marginBottom: 8,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border,
    gap: 8,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 13, color: colors.textSecondary },
  summaryValue: { fontSize: 13, fontWeight: '600', color: colors.text },

  footer: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  placeBtn: {
    paddingVertical: 15, borderRadius: 8, alignItems: 'center',
  },
  placeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
