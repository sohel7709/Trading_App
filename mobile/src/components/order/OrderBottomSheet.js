/**
 * OrderBottomSheet.js
 * ────────────────────
 * Bottom-sheet component for placing option buy/sell orders.
 *
 * Props:
 *   visible         {boolean}
 *   onClose         {() => void}
 *   onOrderPlaced   {(result) => void}   Called on successful order with result
 *   instrument      {{
 *     underlyingSymbol: string,
 *     strikePrice:      number,
 *     optionType:       'CE' | 'PE',
 *     expiry:           string,
 *     ltp:              number,
 *     lotSize:          number,
 *     openLots:         number,   // existing position lots (0 if none)
 *   }}
 *   defaultSide     {'BUY' | 'SELL'}
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Animated, ScrollView,
  ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { api } from '../../api/client';
import useMarketState from '../../hooks/useMarketState';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt  = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = (n) => {
  n = Number(n || 0);
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L';
  if (n >= 1000)   return '₹' + (n / 1000).toFixed(2) + 'K';
  return fmt(n);
};

// ── Charges Calculator (mirrors chargesService.js in backend) ─────────────────
const OPTION_RATES = {
  brokerageFlat: 20,
  brokerageRate: 0.0003,
  sttSellOnly: 0.001,       // 0.1% sell side only (post Oct-2024 hike)
  exchangeTxn: 0.0003503,   // 0.03503% of premium
  sebi: 0.000001,
  stampDutyBuy: 0.00003,    // 0.003% buy side only
};
const GST = 0.18;

function calcOptionCharges(side, turnover) {
  return {
    brokerage: 20,
    stt: 0,
    exchange: 0,
    sebi: 0,
    stamp: 0,
    gst: 0,
    total: 20,
  };
}

function r2(n) { return Math.round((n || 0) * 100) / 100; }

// ── Margin calculation ────────────────────────────────────────────────────────
// For option BUY: margin = full premium (qty × ltp). No leverage.
// For option SELL: SPAN + Exposure ≈ 15% of underlying notional (simplified NSE rule).
// Underlying notional for index options = lots × lotSize × indexPrice
// We approximate indexPrice as 20× strike for index (or 5× for stock options)
function calcMargin({ side, lots, lotSize, ltp, strikePrice, isEquity }) {
  const qty = lots * lotSize;
  const premium = qty * ltp;
  if (isEquity) {
    return { required: r2(premium), label: side === 'BUY' ? 'Order Value' : 'Sell Value', type: side.toLowerCase() };
  }
  if (side === 'BUY') {
    // Buyer pays full premium upfront
    return { required: r2(premium), label: 'Premium Payable', type: 'buy' };
  } else {
    // Seller pays SPAN + Exposure margin
    // SPAN ≈ 6% of notional, Exposure ≈ 3% = 9% total (simplified SEBI NSE rules)
    // Notional = lotSize × lots × strike (conservative)
    const notional = qty * (strikePrice || ltp * 5);
    const span = r2(notional * 0.06);
    const exposure = r2(notional * 0.03);
    const total = r2(span + exposure);
    return { required: total, span, exposure, label: 'SPAN + Exposure Margin', type: 'sell' };
  }
}

// ── Order Types ───────────────────────────────────────────────────────────────
const ORDER_TYPES = [
  { key: 'MARKET', label: 'MARKET' },
  { key: 'LIMIT',  label: 'LIMIT'  },
  { key: 'SL',     label: 'SL'     },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function OrderBottomSheet({
  visible, onClose, onOrderPlaced, instrument, defaultSide = 'BUY',
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isHalted, reason: haltReason } = useMarketState();

  const [side, setSide]               = useState(defaultSide);
  const [lots, setLots]               = useState('1');
  const [orderType, setOrderType]     = useState('MARKET');
  const [limitPrice, setLimitPrice]   = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [loading, setLoading]         = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [showCharges, setShowCharges] = useState(false);

  const slideAnim = useRef(new Animated.Value(700)).current;

  useEffect(() => {
    if (visible) {
      setSide(defaultSide);
      setLots('1');
      setOrderType('MARKET');
      const numLtp = Number(instrument?.ltp) || 0;
      setLimitPrice(numLtp > 0 ? numLtp.toFixed(1) : '');
      setTriggerPrice('');
      setShowCharges(false);
      api.getWallet()
        .then(w => {
          if (w) {
            const bal = w.availableMargin != null ? Number(w.availableMargin) : (w.balancePaise != null ? w.balancePaise / 100 : (w.balance ?? 0));
            setWalletBalance(bal);
          }
        })
        .catch(() => {});
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 10 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 700, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, defaultSide, instrument]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const isEquity   = instrument?.strikePrice == null && !instrument?.optionType;
  const parsedLots = Math.max(1, parseInt(lots, 10) || 1);
  const lotSize    = instrument?.lotSize || (isEquity ? 1 : 50);
  const qty        = parsedLots * lotSize;
  const ltp        = Number(instrument?.ltp) || 0;
  const execPrice  = orderType === 'MARKET' ? ltp : (parseFloat(limitPrice) || ltp);

  const estimatedValue = useMemo(() => r2(execPrice * qty), [execPrice, qty]);

  const margin = useMemo(() =>
    calcMargin({
      side,
      lots: parsedLots,
      lotSize,
      ltp: execPrice,
      strikePrice: instrument?.strikePrice,
      isEquity,
    }),
    [side, parsedLots, lotSize, execPrice, instrument?.strikePrice, isEquity]
  );

  const charges = useMemo(() =>
    calcOptionCharges(side, estimatedValue),
    [side, estimatedValue]
  );

  const totalCost = useMemo(() =>
    r2(margin.required + charges.total),
    [margin.required, charges.total]
  );

  const isBuy  = side === 'BUY';
  const color  = isBuy ? colors.buyAction : colors.sellAction;
  const colorLight = isBuy ? '#eff6ff' : '#fef2f2';
  const colorDark  = isBuy ? '#1557B0' : '#dc2626';
  const hasPos = (instrument?.openLots ?? 0) > 0;

  const insufficientFunds = walletBalance !== null && walletBalance < totalCost;

  // ── Order placement ───────────────────────────────────────────────────────
  const [successVisible, setSuccessVisible] = useState(false);

  const placeOrder = async () => {
    if (loading) return;
    if (isHalted) {
      alert(`Trading is currently halted: ${haltReason || 'Exchange Circuit Breaker Active'}`);
      return;
    }
    setLoading(true);
    try {
      // If LTP is unavailable, don't silently execute at ₹100
      const execP = orderType === 'MARKET'
        ? (ltp > 0 ? ltp : 0)
        : (parseFloat(limitPrice) || 0);
      if (execP <= 0) {
        alert('Price data not available yet. Please wait a moment and try again.');
        setLoading(false);
        return;
      }
      let result;
      if (isEquity) {
        result = await api.placeOrder({
          stockSymbol: instrument.underlyingSymbol || instrument.stockSymbol || instrument.symbol,
          qty,
          quantity: qty,
          price: execP,
          side,
          productType: 'CNC',
          orderType: orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
          mode: orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
        });
      } else {
        result = await api.placeOptionOrder({
          underlyingSymbol: instrument.underlyingSymbol,
          strikePrice:      instrument.strikePrice ?? 0,
          optionType:       instrument.optionType || 'CE',
          expiry:           instrument.expiry || 'NEAR',
          side,
          action:           side,
          lots: parsedLots,
          orderType,
          price:            execP,
          premium:          execP,
          triggerPrice: orderType === 'SL' ? parseFloat(triggerPrice) : undefined,
        });
      }
      setSuccessVisible(true);
      try {
        onOrderPlaced?.({ success: true, result });
      } catch (cbErr) {
        console.warn('[OrderBottomSheet] onOrderPlaced callback error:', cbErr);
      }
      setTimeout(() => {
        setSuccessVisible(false);
        onClose();
        try {
          navigation.navigate('Positions', { screen: 'PositionsMain' });
        } catch (navErr) {
          console.warn('[OrderBottomSheet] Navigation to Positions failed:', navErr);
        }
      }, 1000);
    } catch (err) {
      const errMsg = err?.message || String(err || 'Order placement failed');
      try {
        onOrderPlaced?.({ success: false, error: errMsg });
      } catch (cbErr) {
        console.warn('[OrderBottomSheet] onOrderPlaced error callback error:', cbErr);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const stepLots = (d) => setLots(s => String(Math.max(1, (parseInt(s, 10) || 1) + d)));

  if (!instrument) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={st.backdrop} onPress={onClose} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.kav} pointerEvents="box-none">
        <Animated.View style={[st.sheet, { paddingBottom: insets.bottom + 12, transform: [{ translateY: slideAnim }] }]}>

          {successVisible && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 24 }]}>
              <Ionicons name="checkmark-circle" size={80} color={colors.gain} style={{ marginBottom: 16 }} />
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>Order Placed</Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8 }}>
                {instrument?.underlyingSymbol || 'Instrument'} {side || 'BUY'} order successful
              </Text>
            </View>
          )}

          {/* Handle */}
          <View style={st.handle} />

          {/* Header */}
          <View style={st.header}>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>
                {instrument.underlyingSymbol}
                {instrument.strikePrice ? ` ${instrument.strikePrice} ${instrument.optionType}` : ''}
              </Text>
              {instrument.expiry && (
                <Text style={st.subtitle}>Expiry: {instrument.expiry}  ·  LTP: {fmt(ltp)}</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={st.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Circuit Breaker / Market Halt Banner */}
          {isHalted && (
            <View style={st.haltBanner}>
              <Ionicons name="warning" size={18} color="#b91c1c" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={st.haltBannerTitle}>Market Temporarily Halted</Text>
                <Text style={st.haltBannerSub}>
                  {haltReason || 'Exchange circuit breaker triggered. Order entry is paused by administrator.'}
                </Text>
              </View>
            </View>
          )}

          {/* Existing position banner */}
          {hasPos && (
            <View style={st.posBanner}>
              <Ionicons name="alert-circle" size={15} color="#1A73E8" />
              <Text style={st.posBannerText}>
                You hold {instrument.openLots} lot{instrument.openLots !== 1 ? 's' : ''} · Tap SELL to exit
              </Text>
            </View>
          )}

          {/* BUY / SELL Toggle */}
          <View style={st.toggle}>
            <TouchableOpacity
              style={[st.toggleBtn, isBuy && { backgroundColor: colors.buyAction }]}
              onPress={() => setSide('BUY')} activeOpacity={0.85}
            >
              <Ionicons name="trending-up" size={14} color={isBuy ? '#fff' : colors.textMuted} />
              <Text style={[st.toggleBtnText, isBuy && st.toggleBtnTextActive]}>BUY</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.toggleBtn, !isBuy && { backgroundColor: colors.sellAction }]}
              onPress={() => setSide('SELL')} activeOpacity={0.85}
            >
              <Ionicons name="trending-down" size={14} color={!isBuy ? '#fff' : colors.textMuted} />
              <Text style={[st.toggleBtnText, !isBuy && st.toggleBtnTextActive]}>SELL</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 4 }}>

            {/* Order Type */}
            <View style={st.section}>
              <Text style={st.label}>Order Type</Text>
              <View style={st.chipRow}>
                {ORDER_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[st.chip, orderType === t.key && { backgroundColor: color, borderColor: color }]}
                    onPress={() => setOrderType(t.key)} activeOpacity={0.8}
                  >
                    <Text style={[st.chipText, orderType === t.key && { color: '#fff' }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Lots */}
            <View style={st.section}>
              <Text style={st.label}>Lots</Text>
              <View style={st.qtyRow}>
                <TouchableOpacity style={st.stepBtn} onPress={() => stepLots(-1)}>
                  <Ionicons name="remove" size={20} color={colors.text} />
                </TouchableOpacity>
                <View style={st.qtyCenter}>
                  <TextInput
                    style={st.qtyInput}
                    value={lots}
                    onChangeText={v => setLots(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    maxLength={4}
                  />
                  <Text style={st.qtyUnit}>{isEquity ? `${qty} share${qty > 1 ? 's' : ''}` : `${parsedLots} lot${parsedLots > 1 ? 's' : ''} × ${lotSize} = `}{!isEquity && <Text style={{ fontWeight: '700', color: colors.text }}>{qty} qty</Text>}</Text>
                </View>
                <TouchableOpacity style={st.stepBtn} onPress={() => stepLots(1)}>
                  <Ionicons name="add" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Limit / Trigger price fields */}
            {(orderType === 'LIMIT' || orderType === 'SL') && (
              <View style={st.section}>
                <Text style={st.label}>Limit Price (₹)</Text>
                <TextInput
                  style={st.priceInput}
                  value={limitPrice}
                  onChangeText={setLimitPrice}
                  keyboardType="decimal-pad"
                  placeholder={(Number(ltp) || 0).toFixed(1)}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}
            {orderType === 'SL' && (
              <View style={st.section}>
                <Text style={st.label}>Trigger Price (₹)</Text>
                <TextInput
                  style={st.priceInput}
                  value={triggerPrice}
                  onChangeText={setTriggerPrice}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 120.00"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            {/* ── Margin & Value Summary Card ── */}
            <View style={[st.summaryCard, { borderColor: color + '30' }]}>

              {/* Premium / Margin */}
              <View style={st.summaryRow}>
                <View style={st.summaryLabelRow}>
                  <View style={[st.dot, { backgroundColor: color }]} />
                  <Text style={st.summaryLabel}>{margin.label}</Text>
                </View>
                <Text style={[st.summaryValue, { color }]}>{fmtK(margin.required)}</Text>
              </View>

              {/* SPAN + Exposure breakdown for SELL */}
              {!isBuy && margin.span != null && (
                <View style={st.subBreakdown}>
                  <Text style={st.subItem}>SPAN <Text style={st.subItemVal}>{fmtK(margin.span)}</Text></Text>
                  <Text style={st.subItem}>Exposure <Text style={st.subItemVal}>{fmtK(margin.exposure)}</Text></Text>
                </View>
              )}

              <View style={st.divider} />

              {/* Estimated Value */}
              <View style={st.summaryRow}>
                <View style={st.summaryLabelRow}>
                  <View style={[st.dot, { backgroundColor: '#94a3b8' }]} />
                  <Text style={st.summaryLabel}>Contract Value</Text>
                </View>
                <Text style={st.summaryValue}>{fmtK(estimatedValue)}</Text>
              </View>

              {/* Charges */}
              <TouchableOpacity style={st.summaryRow} onPress={() => setShowCharges(v => !v)} activeOpacity={0.8}>
                <View style={st.summaryLabelRow}>
                  <View style={[st.dot, { backgroundColor: '#f59e0b' }]} />
                  <Text style={st.summaryLabel}>Charges & Taxes</Text>
                  <Ionicons name={showCharges ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textMuted} style={{ marginLeft: 4 }} />
                </View>
                <Text style={[st.summaryValue, { color: '#f59e0b' }]}>{fmt(charges.total)}</Text>
              </TouchableOpacity>

              {/* Expanded charges breakdown */}
              {showCharges && (
                <View style={st.chargesBreakdown}>
                  {[
                    { label: 'Brokerage', val: charges.brokerage },
                    { label: 'STT', val: charges.stt },
                    { label: 'Exchange Charges', val: charges.exchange },
                    { label: 'SEBI Charges', val: charges.sebi },
                    { label: 'Stamp Duty', val: charges.stamp },
                    { label: 'GST (18%)', val: charges.gst },
                  ].map(({ label, val }) => (
                    <View key={label} style={st.chargeRow}>
                      <Text style={st.chargeLbl}>{label}</Text>
                      <Text style={st.chargeVal}>{fmt(val)}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[st.divider, { borderColor: color + '30' }]} />

              {/* Total Cost */}
              <View style={[st.summaryRow, { marginBottom: 0 }]}>
                <Text style={[st.summaryLabel, { fontWeight: '700', color: colors.text }]}>Total Required</Text>
                <Text style={[st.summaryValue, { fontSize: 16, color }]}>{fmtK(totalCost)}</Text>
              </View>

              {/* Balance */}
              {walletBalance !== null && (
                <View style={[st.balanceRow, { backgroundColor: insufficientFunds ? '#fef2f2' : '#ecfdf5', marginTop: 10 }]}>
                  <Ionicons
                    name={insufficientFunds ? 'warning-outline' : 'checkmark-circle-outline'}
                    size={14}
                    color={insufficientFunds ? colors.loss : colors.gain}
                  />
                  <Text style={[st.balanceTxt, { color: insufficientFunds ? colors.loss : colors.gain }]}>
                    Available Margin: {fmtK(walletBalance)}
                    {insufficientFunds ? '  ⚠ Insufficient margin' : '  ✓ Sufficient'}
                  </Text>
                </View>
              )}
            </View>

          </ScrollView>

          {/* Place Order Button */}
          <TouchableOpacity
            style={[
              st.placeBtn,
              isHalted ? st.placeBtnHalted : { backgroundColor: color },
              (loading || isHalted) && st.placeBtnDisabled
            ]}
            onPress={placeOrder}
            disabled={loading || isHalted}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : isHalted ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="pause-circle" size={18} color="#fff" />
                <Text style={st.placeBtnText}>Trading Halted by Administrator</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={isBuy ? 'trending-up' : 'trending-down'} size={18} color="#fff" />
                <Text style={st.placeBtnText}>
                  {side} {isEquity ? `${qty} share${qty > 1 ? 's' : ''}` : `${parsedLots} lot${parsedLots > 1 ? 's' : ''}`} · {fmtK(totalCost)}
                </Text>
              </View>
            )}
          </TouchableOpacity>

        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.5)' },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 8,
    maxHeight: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14, shadowRadius: 24, elevation: 24,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#cbd5e1', alignSelf: 'center', marginBottom: 18,
  },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  closeBtn: { padding: 6, backgroundColor: '#f1f5f9', borderRadius: 20 },

  // Position banner
  posBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eff6ff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12,
  },
  posBannerText: { fontSize: 12, color: colors.primary, fontWeight: '600', flex: 1 },

  // BUY/SELL toggle
  toggle: {
    flexDirection: 'row', backgroundColor: '#f1f5f9',
    borderRadius: 14, padding: 4, marginBottom: 20, gap: 4,
  },
  toggleBtn: { flex: 1, borderRadius: 11, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  toggleBtnText: { fontSize: 15, fontWeight: '800', color: '#94a3b8' },
  toggleBtnTextActive: { color: '#fff' },

  // Sections
  section: { marginBottom: 18 },
  label: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },

  // Order type chips
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#64748b' },

  // Quantity stepper
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  qtyCenter: { flex: 1, alignItems: 'center' },
  qtyInput: { fontSize: 30, fontWeight: '800', color: colors.text, textAlign: 'center', minWidth: 60 },
  qtyUnit: { fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: '500' },

  // Price input
  priceInput: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 18, fontWeight: '700', color: colors.text, backgroundColor: '#f8fafc',
  },

  // Summary card
  summaryCard: {
    backgroundColor: '#f8fafc', borderRadius: 16,
    padding: 16, marginBottom: 16,
    borderWidth: 1.5,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  summaryLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  summaryValue: { fontSize: 14, fontWeight: '800', color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4 },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },

  // SELL margin breakdown
  subBreakdown: { flexDirection: 'row', gap: 16, paddingLeft: 16, marginTop: -6, marginBottom: 8 },
  subItem: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  subItemVal: { color: '#64748b', fontWeight: '700' },

  // Charges breakdown (expandable)
  chargesBreakdown: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 8,
    borderWidth: 1, borderColor: '#f1f5f9',
  },
  chargeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  chargeLbl: { fontSize: 12, color: '#64748b' },
  chargeVal: { fontSize: 12, fontWeight: '600', color: '#0f172a' },

  // Balance row
  balanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  balanceTxt: { fontSize: 12, fontWeight: '600', flex: 1 },

  // CTA button
  placeBtn: { borderRadius: 18, paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  placeBtnDisabled: { opacity: 0.7 },
  placeBtnHalted: { backgroundColor: '#64748b' },
  placeBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },

  // Halt banner
  haltBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  haltBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991b1b',
  },
  haltBannerSub: {
    fontSize: 11,
    color: '#b91c1c',
    marginTop: 2,
    lineHeight: 15,
  },
});
