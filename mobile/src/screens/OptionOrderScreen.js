import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, Animated, PanResponder, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { isMarketOpen as checkMarketOpen } from '../utils/marketHours';

const BUY_COLOR  = '#387ED1';
const SELL_COLOR = '#E64D3D';
const THUMB = 60;

const SHORT_NAMES = {
  'NIFTY 50': 'NIFTY', 'BANK NIFTY': 'BANKNIFTY',
  'SENSEX': 'SENSEX', 'FINNIFTY': 'FINNIFTY',
};

export default function OptionOrderScreen({ route, navigation }) {
  const {
    underlyingSymbol, strikePrice, optionType, expiry,
    ltp = 0, lotSize = 75, side: initSide = 'BUY', openLots = 0,
  } = route.params || {};
  const insets = useSafeAreaInsets();

  const [side, setSide] = useState(initSide);
  const [qty, setQty] = useState(String(lotSize));
  const [price, setPrice] = useState(Number(ltp).toFixed(2));
  const [liveLtp, setLiveLtp] = useState(Number(ltp));
  const [liveChange, setLiveChange] = useState(route.params?.change ?? 0);
  const [product, setProduct] = useState('intraday');
  const [wallet, setWallet] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [marketOpen, setMarketOpen] = useState(checkMarketOpen());

  const isBuy = side === 'BUY';
  const accent = isBuy ? BUY_COLOR : SELL_COLOR;

  // "NIFTY JUL 22400 CE"
  const mon = expiry ? new Date(expiry + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '';
  const title = `${SHORT_NAMES[underlyingSymbol] ?? underlyingSymbol} ${mon} ${strikePrice} ${optionType}`;

  const lots = Math.max(1, Math.round(Number(qty || 0) / lotSize));
  const effQty = lots * lotSize;
  const effPrice = Number(price) || 0;
  const margin = effQty * effPrice;
  const charges = Math.round(margin * 0.001 * 100) / 100;
  const available = Number(wallet?.availableMargin ?? 0);

  // Refresh available margin every time this screen is focused
  useFocusEffect(useCallback(() => {
    api.getWallet().then(setWallet).catch(() => {});
  }, []));

  useEffect(() => {
    const t = setInterval(() => setMarketOpen(checkMarketOpen()), 60000);
    return () => clearInterval(t);
  }, []);

  // Live LTP for this contract from the (Dhan) option chain, every 3s
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const chain = await api.getOptionChain(underlyingSymbol, expiry);
        const row = chain?.rows?.find(r => r.strike === Number(strikePrice));
        if (!stop && row) {
          const s = optionType === 'CE' ? row.ce : row.pe;
          setLiveLtp(s.ltp);
          setLiveChange(s.change ?? 0);
        }
      } catch { /* keep last */ }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [underlyingSymbol, strikePrice, optionType, expiry]);

  const changePct = liveLtp - liveChange > 0 ? (liveChange / (liveLtp - liveChange)) * 100 : 0;
  const ltpColor = liveChange > 0 ? '#25B87E' : liveChange < 0 ? SELL_COLOR : '#1E1E1E';

  // ── Swipe-to-confirm slider ────────────────────────────────────────────────
  const slideX = useRef(new Animated.Value(0)).current;
  const trackW = useRef(0);
  const stateRef = useRef({});
  stateRef.current = { lots, effPrice, side, marketOpen, placing };

  const resetSlider = useCallback(() => {
    Animated.spring(slideX, { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
  }, [slideX]);

  const submitOrder = useCallback(async () => {
    const s = stateRef.current;
    if (s.placing) return;
    if (!s.marketOpen) {
      Alert.alert('Market closed', 'NSE trading hours: Mon–Fri, 9:15 AM – 3:30 PM IST.');
      resetSlider();
      return;
    }
    if (!s.effPrice || s.effPrice <= 0) {
      Alert.alert('Invalid price', 'Enter a valid limit price');
      resetSlider();
      return;
    }
    setPlacing(true);
    try {
      const result = await api.placeOptionOrder({
        underlyingSymbol,
        strikePrice: Number(strikePrice),
        optionType,
        expiry,
        lots: s.lots,
        premium: s.effPrice,
        action: s.side,
      });
      const pnlLine = s.side === 'SELL' && result.pnl != null
        ? `\nP&L: ${result.pnl >= 0 ? '+' : ''}₹${result.pnl.toFixed(2)}`
        : '';
      Alert.alert(
        `${s.side} order executed`,
        `${title} · ${s.lots} lot${s.lots > 1 ? 's' : ''} @ ₹${s.effPrice.toFixed(2)}${pnlLine}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Order failed', e.message);
      resetSlider();
    } finally {
      setPlacing(false);
    }
  }, [underlyingSymbol, strikePrice, optionType, expiry, title, navigation, resetSlider]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
      onPanResponderMove: (_, g) => {
        const max = Math.max(1, trackW.current - THUMB - 8);
        slideX.setValue(Math.min(Math.max(0, g.dx), max));
      },
      onPanResponderRelease: (_, g) => {
        const max = Math.max(1, trackW.current - THUMB - 8);
        if (g.dx >= max * 0.7) {
          Animated.timing(slideX, { toValue: max, duration: 120, useNativeDriver: false }).start();
          submitOrder();
        } else {
          Animated.spring(slideX, { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
        }
      },
    })
  ).current;

  const sliderColor = marketOpen ? accent : '#9CA3AF';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color="#1E1E1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <Ionicons name="ellipsis-vertical" size={20} color="#B3BBBF" />
      </View>

      {/* ── LTP banner ── */}
      <View style={styles.ltpBanner}>
        <Text style={styles.ltpExch}>NFO</Text>
        <Text style={[styles.ltpPrice, { color: ltpColor }]}>
          ₹ {liveLtp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={[styles.ltpChange, { color: ltpColor }]}>
          {liveChange > 0 ? '+' : ''}{liveChange.toFixed(2)}
        </Text>
        <Text style={[styles.ltpChange, { color: ltpColor }]}>
          {liveChange > 0 ? '+' : ''}{changePct.toFixed(2)}%
        </Text>
        {/* BUY / SELL flip */}
        <View style={{ flex: 1 }} />
        <View style={styles.sideToggle}>
          {['BUY', 'SELL'].map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.sideTgBtn, side === s && { backgroundColor: s === 'BUY' ? BUY_COLOR : SELL_COLOR }]}
              onPress={() => setSide(s)}
            >
              <Text style={[styles.sideTgTxt, side === s && { color: '#fff' }]}>{s[0]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabs}>
        <View style={styles.tabActiveWrap}>
          <Text style={[styles.tabActive, { color: accent }]}>Regular</Text>
          <View style={[styles.tabUnderline, { backgroundColor: accent }]} />
        </View>
        <Text style={styles.tabInactive}>Iceberg</Text>
      </View>

      {/* ── Order card ── */}
      <View style={styles.card}>
        <View style={styles.cardLabelRow}>
          <Text style={styles.cardLabel}>Quantity</Text>
          <Text style={styles.cardLabelRight}>{lots} lot{lots > 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={qty}
            onChangeText={v => setQty(v.replace(/[^0-9]/g, ''))}
            onBlur={() => setQty(String(Math.max(1, Math.round(Number(qty || 0) / lotSize)) * lotSize))}
            keyboardType="numeric"
          />
          <TouchableOpacity
            style={styles.inputBtn}
            onPress={() => setQty(String((lots + 1) * lotSize))}
          >
            <Ionicons name="swap-vertical" size={20} color={accent} />
          </TouchableOpacity>
        </View>

        <View style={[styles.cardLabelRow, { marginTop: 18 }]}>
          <Text style={styles.cardLabel}>Limit</Text>
          <Ionicons name="pencil-outline" size={15} color={accent} style={{ marginLeft: 6 }} />
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
          <TouchableOpacity
            style={styles.inputBtn}
            onPress={() => setPrice(liveLtp.toFixed(2))}
          >
            <Ionicons name="swap-vertical" size={20} color={accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Intraday / Overnight ── */}
      <View style={styles.productRow}>
        {[
          { id: 'intraday', label: 'Intraday' },
          { id: 'overnight', label: 'Overnight' },
        ].map(p => (
          <TouchableOpacity key={p.id} style={styles.radioRow} onPress={() => setProduct(p.id)}>
            <View style={[styles.radioOuter, product === p.id && { borderColor: accent }]}>
              {product === p.id && <View style={[styles.radioInner, { backgroundColor: accent }]} />}
            </View>
            <Text style={[styles.radioLabel, product === p.id && { color: '#1E1E1E' }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── More ── */}
      <View style={styles.moreWrap}>
        <Text style={styles.moreTxt}>More</Text>
        <Ionicons name="chevron-down" size={18} color="#738390" />
        {openLots > 0 && (
          <Text style={styles.openPosNote}>Open position: {openLots} lot{openLots > 1 ? 's' : ''}</Text>
        )}
      </View>

      <View style={{ flex: 1 }} />

      {/* ── Margin bar ── */}
      <View style={styles.marginBar}>
        <Text style={styles.marginLabel}>Margin</Text>
        <Text style={[styles.marginValue, { color: accent }]}>
          ₹{Math.round(margin).toLocaleString('en-IN')}
        </Text>
        <Text style={styles.marginLabel}> + </Text>
        <Text style={[styles.marginValue, { color: accent }]}>₹{charges.toFixed(2)}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.marginLabel}>Avail. </Text>
        <Text style={[styles.marginValue, { color: accent }]}>
          ₹{available.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </Text>
      </View>

      {!marketOpen && (
        <View style={styles.closedBanner}>
          <Ionicons name="time-outline" size={14} color="#92400E" />
          <Text style={styles.closedTxt}>Market closed · Mon–Fri 9:15 AM – 3:30 PM IST</Text>
        </View>
      )}

      {/* ── SWIPE TO BUY / SELL ── */}
      <View style={[styles.swipeWrap, { paddingBottom: insets.bottom + 14 }]}>
        <View
          style={[styles.swipeTrack, { backgroundColor: sliderColor }]}
          onLayout={e => { trackW.current = e.nativeEvent.layout.width; }}
        >
          <Text style={styles.swipeText}>
            {placing ? 'PLACING ORDER…' : `SWIPE TO ${side}`}
          </Text>
          <Animated.View
            style={[styles.swipeThumb, { transform: [{ translateX: slideX }] }]}
            {...panResponder.panHandlers}
          >
            {placing
              ? <ActivityIndicator color={sliderColor} size="small" />
              : <Ionicons name="chevron-forward" size={26} color={sliderColor} />}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#F4F5F7',
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 20, fontWeight: '600', color: '#1E1E1E', letterSpacing: 0.3,
  },

  ltpBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#ECEDEF',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  ltpExch: { fontSize: 14, color: '#5A6570', fontWeight: '500' },
  ltpPrice: { fontSize: 15, fontWeight: '600' },
  ltpChange: { fontSize: 14, fontWeight: '500' },
  sideToggle: { flexDirection: 'row', gap: 4 },
  sideTgBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#DDE1E5',
  },
  sideTgTxt: { fontSize: 12, fontWeight: '800', color: '#738390' },

  tabs: {
    flexDirection: 'row', gap: 28,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 0,
  },
  tabActiveWrap: { alignItems: 'center' },
  tabActive: { fontSize: 17, fontWeight: '600' },
  tabUnderline: { height: 3, borderRadius: 2, alignSelf: 'stretch', marginTop: 8 },
  tabInactive: { fontSize: 17, fontWeight: '500', color: '#9AA4AB' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 12, marginTop: 16,
    padding: 18,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardLabel: { fontSize: 16, fontWeight: '700', color: '#1E1E1E' },
  cardLabelRight: { marginLeft: 'auto', fontSize: 13, color: '#9AA4AB' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, height: 56,
    borderWidth: 1, borderColor: '#E3E6E8', borderRadius: 8,
    paddingHorizontal: 14, fontSize: 20, fontWeight: '500', color: '#1E1E1E',
    backgroundColor: '#fff',
  },
  inputBtn: {
    width: 64, height: 56,
    borderWidth: 1, borderColor: '#E3E6E8', borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff',
  },

  productRow: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 24,
    backgroundColor: '#F8F9FA',
    marginHorizontal: 12, marginTop: 2,
    paddingHorizontal: 18, paddingVertical: 16,
    borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
  },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#C6CCD1',
    justifyContent: 'center', alignItems: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  radioLabel: { fontSize: 15, color: '#5A6570', fontWeight: '500' },

  moreWrap: { alignItems: 'center', marginTop: 26, gap: 4 },
  moreTxt: { fontSize: 16, color: '#3C4852', fontWeight: '500' },
  openPosNote: { fontSize: 12, color: '#6366F1', fontWeight: '600', marginTop: 8 },

  marginBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ECEDEF',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  marginLabel: { fontSize: 14, color: '#5A6570' },
  marginValue: { fontSize: 14, fontWeight: '600' },

  closedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FEF3C7', paddingVertical: 7,
  },
  closedTxt: { fontSize: 12, color: '#92400E' },

  swipeWrap: { paddingHorizontal: 16, paddingTop: 14, backgroundColor: '#fff' },
  swipeTrack: {
    height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  swipeText: {
    color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '700', letterSpacing: 2.5,
  },
  swipeThumb: {
    position: 'absolute', left: 4, top: 2,
    width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 1, height: 1 },
    elevation: 3,
  },
});
