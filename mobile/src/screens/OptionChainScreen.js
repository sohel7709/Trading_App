import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, FlatList,
  ScrollView, ActivityIndicator, RefreshControl, StatusBar, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';
import OrderBottomSheet from '../components/order/OrderBottomSheet';
import RejectionReasonModal from '../components/order/RejectionReasonModal';

// ── Constants ─────────────────────────────────────────────────────────────────
const LOT_SIZES = {
  'NIFTY 50': 75, 'BANK NIFTY': 30, 'SENSEX': 20, 'FINNIFTY': 65,
  'MIDCPNIFTY': 120, 'NIFTY NEXT 50': 25, 'BANKEX': 30,
};

const CHAIN_INDICES = [
  { id: 'NIFTY 50', label: 'NIFTY', short: 'N50' },
  { id: 'BANK NIFTY', label: 'BANKNIFTY', short: 'BNK' },
  { id: 'FINNIFTY', label: 'FINNIFTY', short: 'FIN' },
  { id: 'SENSEX', label: 'SENSEX', short: 'SNX' },
  { id: 'MIDCPNIFTY', label: 'MIDCAP', short: 'MID' },
  { id: 'NIFTY NEXT 50', label: 'NIFTY NXT', short: 'NN50' },
  { id: 'BANKEX', label: 'BANKEX', short: 'BKX' },
];

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtOI = (val) => {
  if (!val) return '-';
  if (val >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000)   return `${(val / 100000).toFixed(1)}L`;
  if (val >= 1000)     return `${(val / 1000).toFixed(1)}K`;
  return String(val);
};

const fmtPrice = (v) => {
  const n = Number(v);
  return isNaN(n) || v == null ? '-' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtChange = (v) => {
  const n = Number(v);
  if (isNaN(n) || v == null) return '';
  return (n >= 0 ? '+' : '') + n.toFixed(2);
};

// ── OI Bar component ──────────────────────────────────────────────────────────
function OIBar({ oi, maxOI, side }) {
  const numOI = Number(oi) || 0;
  const safeMax = Number(maxOI) > 0 ? Number(maxOI) : 1;
  const rawPct = (numOI / safeMax) * 100;
  const pct = Math.max(0, Math.min(100, isNaN(rawPct) ? 0 : Math.round(rawPct)));
  const isCall = side === 'CE';
  return (
    <View style={[barStyles.wrap, isCall ? barStyles.wrapCE : barStyles.wrapPE]}>
      <View
        style={[
          barStyles.fill,
          { width: `${pct}%` },
          isCall ? barStyles.fillCE : barStyles.fillPE,
        ]}
      />
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrap:   { height: 3, borderRadius: 2, overflow: 'hidden', flex: 1 },
  wrapCE: { backgroundColor: '#dbeafe', marginLeft: 8 },
  wrapPE: { backgroundColor: '#fee2e2', marginRight: 8 },
  fill:   { height: '100%', borderRadius: 2 },
  fillCE: { backgroundColor: '#3b82f6', alignSelf: 'flex-end' },
  fillPE: { backgroundColor: '#ef4444' },
});

// ── Row component (Memoized to update only rows whose LTP or OI changed) ──
const ChainRow = React.memo(function ChainRow({ item, maxOI, onCEPress, onPEPress, cePos, pePos }) {
  const isATM = item.isATM;
  const ceLTP   = item.ce?.ltp ?? 0;
  const peLTP   = item.pe?.ltp ?? 0;
  const ceOI    = item.ce?.oi ?? 0;
  const peOI    = item.pe?.oi ?? 0;
  const ceChg   = item.ce?.change ?? 0;
  const peChg   = item.pe?.change ?? 0;

  return (
    <View style={[rowStyles.row, isATM && rowStyles.atmRow]}>
      {/* ── CE ── */}
      <TouchableOpacity style={rowStyles.ceCell} onPress={onCEPress} activeOpacity={0.75}>
        <View style={rowStyles.ceCellInner}>
          <View style={rowStyles.priceCol}>
            <Text style={[rowStyles.ltp, isATM && rowStyles.atmLTP]}>{fmtPrice(ceLTP)}</Text>
            <Text style={[rowStyles.chg, { color: ceChg >= 0 ? '#10b981' : '#ef4444' }]}>
              {fmtChange(ceChg)}
            </Text>
          </View>
          <View style={rowStyles.oiCol}>
            <Text style={rowStyles.oi}>{fmtOI(ceOI)}</Text>
            <OIBar oi={ceOI} maxOI={maxOI} side="CE" />
          </View>
          {cePos && (
            <View style={rowStyles.posTag}>
              <Text style={rowStyles.posTagTxt}>
                {cePos.lots ?? Math.max(1, Math.round(Math.abs(Number(cePos.quantity || 0)) / (Number(cePos.lotSize) || 50)))}L
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* ── Strike ── */}
      <View style={[rowStyles.strikeCol, isATM && rowStyles.atmStrikeCol]}>
        <Text style={[rowStyles.strike, isATM && rowStyles.atmStrike]}>
          {item.strike}
        </Text>
        {isATM && (
          <View style={rowStyles.atmPill}>
            <Text style={rowStyles.atmPillTxt}>ATM</Text>
          </View>
        )}
      </View>

      {/* ── PE ── */}
      <TouchableOpacity style={rowStyles.peCell} onPress={onPEPress} activeOpacity={0.75}>
        <View style={rowStyles.peCellInner}>
          {pePos && (
            <View style={[rowStyles.posTag, { backgroundColor: '#fef2f2' }]}>
              <Text style={[rowStyles.posTagTxt, { color: '#ef4444' }]}>
                {pePos.lots ?? Math.max(1, Math.round(Math.abs(Number(pePos.quantity || 0)) / (Number(pePos.lotSize) || 50)))}L
              </Text>
            </View>
          )}
          <View style={rowStyles.oiCol}>
            <Text style={[rowStyles.oi, { textAlign: 'right' }]}>{fmtOI(peOI)}</Text>
            <OIBar oi={peOI} maxOI={maxOI} side="PE" />
          </View>
          <View style={[rowStyles.priceCol, { alignItems: 'flex-end' }]}>
            <Text style={[rowStyles.ltp, isATM && rowStyles.atmLTP]}>{fmtPrice(peLTP)}</Text>
            <Text style={[rowStyles.chg, { color: peChg >= 0 ? '#10b981' : '#ef4444' }]}>
              {fmtChange(peChg)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}, (prev, next) => {
  return (
    prev.item.isATM === next.item.isATM &&
    prev.item.strike === next.item.strike &&
    prev.item.ce?.ltp === next.item.ce?.ltp &&
    prev.item.pe?.ltp === next.item.pe?.ltp &&
    prev.item.ce?.oi === next.item.ce?.oi &&
    prev.item.pe?.oi === next.item.pe?.oi &&
    prev.item.ce?.change === next.item.ce?.change &&
    prev.item.pe?.change === next.item.pe?.change &&
    prev.maxOI === next.maxOI &&
    prev.cePos === next.cePos &&
    prev.pePos === next.pePos
  );
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', height: 52,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    backgroundColor: '#FFFFFF',
  },
  atmRow: { backgroundColor: '#fffbeb' },

  ceCell: { flex: 1, justifyContent: 'center', paddingHorizontal: 0 },
  ceCellInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },

  peCell: { flex: 1, justifyContent: 'center' },
  peCellInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },

  priceCol: { alignItems: 'flex-start', minWidth: 52 },
  oiCol: { flex: 1, alignItems: 'center' },

  ltp: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  atmLTP: { fontSize: 13, fontWeight: '800', color: '#1A73E8' },
  chg: { fontSize: 9, fontWeight: '600', marginTop: 1 },
  oi: { fontSize: 9, color: '#94a3b8', fontWeight: '600', marginBottom: 2 },

  strikeCol: {
    width: 72, alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  atmStrikeCol: { backgroundColor: '#fef3c7', borderColor: '#fcd34d' },
  strike: { fontSize: 11, fontWeight: '700', color: '#0f172a' },
  atmStrike: { fontSize: 12, fontWeight: '800', color: '#d97706' },
  atmPill: {
    marginTop: 3, backgroundColor: '#f59e0b',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  atmPillTxt: { fontSize: 7, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  posTag: {
    backgroundColor: '#eff6ff', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  posTagTxt: { fontSize: 9, fontWeight: '800', color: '#1A73E8' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function OptionChainScreen({ navigation, route }) {
  const initIndex = route?.params?.indexName || 'NIFTY 50';
  const [selectedIndex, setSelectedIndex] = useState(initIndex);
  const [expiries, setExpiries]     = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [chain, setChain]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allIndexes, setAllIndexes] = useState({});
  const [optionPositions, setOptionPositions] = useState([]);
  const [showAllStrikes, setShowAllStrikes]   = useState(false);

  const insets = useSafeAreaInsets();
  const intervalRef      = useRef(null);
  const flatListRef      = useRef(null);
  const selectedIndexRef  = useRef(selectedIndex);
  const selectedExpiryRef = useRef(selectedExpiry);
  selectedIndexRef.current  = selectedIndex;
  selectedExpiryRef.current = selectedExpiry;

  const handleIndexChange = useCallback((id) => {
    selectedIndexRef.current = id;
    selectedExpiryRef.current = null;
    setSelectedIndex(id);
    setSelectedExpiry(null);
    setExpiries([]);
    setShowAllStrikes(false);
  }, []);

  const handleExpiryChange = useCallback((exp) => {
    selectedExpiryRef.current = exp;
    setSelectedExpiry(exp);
  }, []);

  // Pulse animation for live dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Order sheet ───────────────────────────────────────────────────────────
  const [sheetVisible, setSheetVisible]       = useState(false);
  const [sheetInstrument, setSheetInstrument] = useState(null);
  const [sheetSide, setSheetSide]             = useState('BUY');
  const [rejectionVisible, setRejectionVisible] = useState(false);
  const [rejectionReason, setRejectionReason]   = useState('');
  const [rejectionOrderInfo, setRejectionOrderInfo] = useState(null);

  // ── Cache-first instant display ───────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(`cache:oc:${selectedIndex}`)
      .then((raw) => {
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached && Array.isArray(cached.rows) && cached.rows.length > 0) {
            setChain(cached);
            if (cached.expiries?.length > 0) {
              setExpiries(cached.expiries);
              if (!selectedExpiryRef.current) setSelectedExpiry(cached.expiries[0]);
            }
            setLoading(false);
          }
        }
      })
      .catch(() => {});
  }, [selectedIndex]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchChain = useCallback(async (forcedExpiry) => {
    const idx    = selectedIndexRef.current;
    const expiry = forcedExpiry !== undefined ? forcedExpiry : selectedExpiryRef.current;
    try {
      const data = await api.getOptionChain(idx, expiry);
      if (data && Array.isArray(data.rows) && data.rows.length > 0) {
        setChain(data);
        AsyncStorage.setItem(`cache:oc:${idx}`, JSON.stringify(data)).catch(() => {});
        if (data.expiries?.length > 0) {
          setExpiries(data.expiries);
          if (!selectedExpiryRef.current) setSelectedExpiry(data.expiries[0]);
        }
      }
    } catch (e) {
      console.log('[OptionChain] Fetch note:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchChain();
      api.getIndexes().then(d => setAllIndexes(d?.indexes || {})).catch(() => {});
      api.getOptionPositions().then(pos => setOptionPositions(Array.isArray(pos) ? pos : [])).catch(() => {});
    }, [fetchChain])
  );

  // ATM ± 10 windowing for lightning fast 60 FPS mobile rendering
  const displayedRows = useMemo(() => {
    if (!chain?.rows || !Array.isArray(chain.rows)) return [];
    if (showAllStrikes || chain.rows.length <= 21) return chain.rows;

    const atmIndex = chain.rows.findIndex(r => r.isATM);
    if (atmIndex < 0) return chain.rows.slice(0, 21);

    const start = Math.max(0, atmIndex - 10);
    const end = Math.min(chain.rows.length, atmIndex + 11);
    return chain.rows.slice(start, end);
  }, [chain?.rows, showAllStrikes]);

  // Scroll to ATM
  useEffect(() => {
    if (displayedRows.length && flatListRef.current) {
      const atmIndex = displayedRows.findIndex(r => r.isATM);
      if (atmIndex > 0) {
        setTimeout(() => flatListRef.current?.scrollToIndex({
          index: Math.max(0, atmIndex - 3), animated: true,
        }), 400);
      }
    }
  }, [displayedRows]);

  // Load on index change + subscribe (No 4s polling - socket handles real-time updates)
  useEffect(() => {
    setLoading(true);
    setChain(null);
    setExpiries([]);
    setSelectedExpiry(null);
    selectedExpiryRef.current = null;
    setShowAllStrikes(false);
    fetchChain(null);
    api.getIndexes().then(d => setAllIndexes(d?.indexes || {})).catch(() => {});
    clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [selectedIndex]);

  // 250ms Real-Time Batched Option Chain Socket Listener
  const pendingChainRef = useRef(null);

  useEffect(() => {
    const flushTimer = setInterval(() => {
      if (pendingChainRef.current) {
        const data = pendingChainRef.current;
        pendingChainRef.current = null;
        setChain(prev => ({
          ...data,
          expiries: data.expiries?.length ? data.expiries : (prev?.expiries || []),
        }));
        if (data.expiries?.length > 0 && !selectedExpiryRef.current) {
          setExpiries(data.expiries);
          setSelectedExpiry(data.expiries[0]);
        }
        setLoading(false);
      }
    }, 250);

    const socket = getSocket();
    if (!socket || typeof socket.on !== 'function') {
      return () => clearInterval(flushTimer);
    }

    // Join room for this underlying index & expiry
    if (typeof socket.emit === 'function') {
      socket.emit('subscribeOptionChain', { indexName: selectedIndex, expiry: selectedExpiry });
    }

    const handleChain = (raw) => {
      const data = raw?.data || raw;
      if (!data || !Array.isArray(data.rows)) return;
      
      const targetIndex = data.indexName || selectedIndexRef.current;
      if (targetIndex !== selectedIndexRef.current) return;

      // Only apply if user is viewing this expiry or default expiry
      const dataExp = data.expiry ? String(data.expiry).split(' ')[0] : null;
      const userExp = selectedExpiryRef.current ? String(selectedExpiryRef.current).split(' ')[0] : null;
      if (!userExp || !dataExp || dataExp === userExp) {
        pendingChainRef.current = data;
      }
    };

    const handleMarketData = (data) => {
      if (!data?.indexes) return;
      setAllIndexes(data.indexes);
      const idxData = data.indexes[selectedIndexRef.current];
      if (!idxData) return;
      setChain(prev => prev
        ? { ...prev, indexPrice: idxData.ltp, indexChange: idxData.change, indexChangePercent: idxData.changePercent }
        : prev
      );
    };

    socket.on('optionChain', handleChain);
    socket.on('optionChainUpdate', handleChain);
    socket.on('marketData', handleMarketData);

    return () => {
      clearInterval(flushTimer);
      if (typeof socket.emit === 'function') {
        socket.emit('unsubscribeOptionChain', { indexName: selectedIndex, expiry: selectedExpiry });
      }
      if (typeof socket.off === 'function') {
        socket.off('optionChain', handleChain);
        socket.off('optionChainUpdate', handleChain);
        socket.off('marketData', handleMarketData);
      }
    };
  }, [selectedIndex, selectedExpiry]);

  // Auto-refresh on focus (whenever user clicks Trade tab)
  useEffect(() => {
    let mounted = true;
    const refreshAll = () => {
      if (api && typeof api.getOptionPositions === 'function') {
        api.getOptionPositions().then(pos => {
          if (mounted && Array.isArray(pos)) setOptionPositions(pos);
        }).catch(() => {});
      }
      fetchChain(selectedExpiryRef.current);
      if (api && typeof api.getIndexes === 'function') {
        api.getIndexes().then(d => {
          if (mounted && d?.indexes) setAllIndexes(d.indexes);
        }).catch(() => {});
      }
    };
    refreshAll();
    const unsub = navigation?.addListener?.('focus', refreshAll);
    return () => {
      mounted = false;
      if (typeof unsub === 'function') {
        unsub();
      } else if (unsub && typeof unsub.remove === 'function') {
        unsub.remove();
      }
    };
  }, [navigation, fetchChain]);

  const getOpenPosition = (strike, optionType) => {
    if (!Array.isArray(optionPositions)) return null;
    return optionPositions.find(
      p => p && p.strikePrice === strike && p.optionType === optionType &&
           p.expiry === selectedExpiryRef.current && p.underlyingSymbol === selectedIndexRef.current
    );
  };

  const openOrderSheet = (item, optionType) => {
    const s = optionType === 'CE' ? item?.ce : item?.pe;
    const openPos = getOpenPosition(item?.strike, optionType);
    setSheetInstrument({
      underlyingSymbol: selectedIndexRef.current,
      strikePrice:      item?.strike,
      optionType,
      expiry:           selectedExpiryRef.current,
      ltp:              Number(s?.ltp) || 0,
      lotSize:          LOT_SIZES[selectedIndexRef.current] || 50,
      openLots:         openPos?.lots ?? 0,
    });
    setSheetSide('BUY');
    setSheetVisible(true);
  };

  const handleOrderResult = ({ success, error }) => {
    if (success) {
      if (api && typeof api.getOptionPositions === 'function') {
        api.getOptionPositions().then(pos => {
          if (Array.isArray(pos)) setOptionPositions(pos);
        }).catch(() => {});
      }
    } else {
      setRejectionReason(typeof error === 'string' ? error : (error?.message || 'Order was rejected'));
      setRejectionOrderInfo(sheetInstrument ? {
        side: sheetSide,
        symbol: `${sheetInstrument.underlyingSymbol} ${sheetInstrument.strikePrice} ${sheetInstrument.optionType}`,
        lots: 1,
      } : null);
      setRejectionVisible(true);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const cleanStr = String(dateStr).split('T')[0];
      const parts = cleanStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (!isNaN(d.getTime())) {
          return `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;
        }
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? String(dateStr) : `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;
    } catch {
      return String(dateStr);
    }
  };

  const selectedIdxData = allIndexes[selectedIndex] || {};
  const isGain = (chain?.indexChange ?? selectedIdxData?.change ?? 0) >= 0;

  const maxOI = useMemo(() => {
    if (!chain?.rows || !Array.isArray(chain.rows) || chain.rows.length === 0) return 1;
    let max = 1;
    for (let i = 0; i < chain.rows.length; i++) {
      const r = chain.rows[i];
      const ceOi = Number(r?.ce?.oi) || 0;
      const peOi = Number(r?.pe?.oi) || 0;
      if (ceOi > max) max = ceOi;
      if (peOi > max) max = peOi;
    }
    return max;
  }, [chain?.rows]);

  const renderRow = ({ item }) => (
    <ChainRow
      item={item}
      maxOI={maxOI}
      onCEPress={() => openOrderSheet(item, 'CE')}
      onPEPress={() => openOrderSheet(item, 'PE')}
      cePos={getOpenPosition(item.strike, 'CE')}
      pePos={getOpenPosition(item.strike, 'PE')}
    />
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Option Chain</Text>
        </View>
        <View style={s.headerRight}>
          <Animated.View style={[s.liveDot, { opacity: pulseAnim }]} />
          <Text style={s.liveLabel}>LIVE</Text>
          <TouchableOpacity onPress={() => { setRefreshing(true); fetchChain(selectedExpiry); }} style={s.refreshBtn}>
            <Ionicons name="refresh" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Index Selector ───────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.indexBar}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center' }}
      >
        {CHAIN_INDICES.map(({ id, label }) => {
          const d = allIndexes[id] || {};
          const active = selectedIndex === id;
          const up = (d.change ?? 0) >= 0;
          return (
            <Pressable
              key={id}
              onPress={() => handleIndexChange(id)}
              style={({ pressed }) => [s.indexPill, active && s.indexPillActive, pressed && { opacity: 0.8 }]}
            >
              <Text style={[s.indexPillName, active && s.indexPillNameActive]}>{label}</Text>
              {d.ltp ? (
                <>
                  <Text style={[s.indexPillPrice, { color: active ? '#fff' : (up ? colors.gain : colors.loss) }]}>
                    {fmtPrice(d.ltp)}
                  </Text>
                  <Text style={[s.indexPillChg, { color: active ? 'rgba(255,255,255,0.8)' : (up ? colors.gain : colors.loss) }]}>
                    {fmtChange(d.changePercent)}%
                  </Text>
                </>
              ) : (
                <Text style={[s.indexPillPrice, { color: active ? 'rgba(255,255,255,0.5)' : '#cbd5e1' }]}>···</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Price Banner ─────────────────────────────────────────────────── */}
      {(chain?.indexPrice || selectedIdxData?.ltp) && (
        <View style={[s.priceBanner, { borderLeftColor: isGain ? colors.gain : colors.loss }]}>
          <View style={s.priceBannerLeft}>
            <Text style={s.priceBannerName}>{selectedIndex}</Text>
            <View style={s.priceBannerRow}>
              <Text style={[s.priceBannerMain, { color: isGain ? colors.gain : colors.loss }]}>
                {fmtPrice(chain?.indexPrice || selectedIdxData?.ltp)}
              </Text>
              <View style={[s.changePill, { backgroundColor: isGain ? '#ecfdf5' : '#fef2f2' }]}>
                <Ionicons
                  name={isGain ? 'trending-up' : 'trending-down'}
                  size={11}
                  color={isGain ? colors.gain : colors.loss}
                />
                <Text style={[s.changePillText, { color: isGain ? colors.gain : colors.loss }]}>
                  {fmtChange(chain?.indexChange ?? selectedIdxData?.change)}{' '}
                  ({fmtChange(chain?.indexChangePercent ?? selectedIdxData?.changePercent)}%)
                </Text>
              </View>
            </View>
          </View>
          {chain?.atmStrike && (
            <View style={s.priceBannerRight}>
              <Text style={s.atmLabel}>ATM Strike</Text>
              <Text style={s.atmValue}>{chain.atmStrike}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Expiry Selector ──────────────────────────────────────────────── */}
      <View style={s.expiryBar}>
        <Text style={s.expiryLabel}>EXPIRY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
          {expiries.length === 0
            ? [1,2,3,4,5].map(i => <View key={i} style={s.expirySkeleton} />)
            : expiries.map(exp => {
                const active = selectedExpiry === exp;
                return (
                  <TouchableOpacity
                    key={exp}
                    style={[s.expiryChip, active && s.expiryChipActive]}
                    onPress={() => { handleExpiryChange(exp); setLoading(true); fetchChain(exp); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.expiryChipText, active && s.expiryChipTextActive]}>
                      {formatDate(exp)}
                    </Text>
                  </TouchableOpacity>
                );
              })
          }
        </ScrollView>
      </View>

      {/* ── Column Headers ───────────────────────────────────────────────── */}
      <View style={s.colHeader}>
        <View style={s.ceHeader}>
          <View style={[s.ceLabel]}>
            <Text style={s.ceLabelText}>CALLS (CE)</Text>
          </View>
          <View style={s.subHeaders}>
            <Text style={s.subHdr}>LTP · Δ</Text>
            <Text style={[s.subHdr, { textAlign: 'right' }]}>OI</Text>
          </View>
        </View>
        <View style={s.strikeHeader}>
          <Text style={s.strikeHeaderText}>STRIKE</Text>
        </View>
        <View style={s.peHeader}>
          <View style={[s.peLabel]}>
            <Text style={s.peLabelText}>PUTS (PE)</Text>
          </View>
          <View style={s.subHeaders}>
            <Text style={s.subHdr}>OI</Text>
            <Text style={[s.subHdr, { textAlign: 'right' }]}>LTP · Δ</Text>
          </View>
        </View>
      </View>

      {/* ── Chain Table ──────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.state}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.stateText}>Fetching live option chain…</Text>
        </View>
      ) : (!chain?.rows?.length) ? (
        <View style={s.state}>
          <View style={s.stateIcon}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={s.stateTitle}>No Market Data</Text>
          <Text style={s.stateSubtitle}>
            Could not reach the server.{'\n'}Pull down to refresh or check your connection.
          </Text>
          <TouchableOpacity
            style={s.retryBtn}
            onPress={() => { setLoading(true); fetchChain(selectedExpiry); }}
          >
            <Ionicons name="refresh" size={14} color="#fff" />
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={displayedRows}
          keyExtractor={(item) => String(item.strike)}
          renderItem={renderRow}
          extraData={`${chain.indexPrice}-${chain.lastUpdated}-${showAllStrikes}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchChain(selectedExpiry); }}
              tintColor={colors.primary}
            />
          }
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={{ paddingBottom: 80 }}
          getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          ListFooterComponent={
            chain?.rows && chain.rows.length > 21 ? (
              <TouchableOpacity
                style={s.toggleStrikesBtn}
                onPress={() => setShowAllStrikes(prev => !prev)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={showAllStrikes ? 'contract-outline' : 'expand-outline'}
                  size={15}
                  color={colors.primary}
                />
                <Text style={s.toggleStrikesText}>
                  {showAllStrikes
                    ? 'Show ATM ± 10 Strikes (Fast Mode)'
                    : `Load All ${chain.rows.length} Strikes`}
                </Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      {chain?.lastUpdated && (
        <View style={[s.statusBar, { paddingBottom: Math.max(8, insets.bottom) }]}>
          <Animated.View style={[s.liveDotSmall, { opacity: pulseAnim }]} />
          <Text style={s.statusText}>
            Live · Updated {(() => {
              try {
                return new Date(chain.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              } catch {
                return '';
              }
            })()}
          </Text>
          <View style={{ flex: 1 }} />
          <Text style={s.statusText}>
            {displayedRows.length}{chain.rows?.length && chain.rows.length !== displayedRows.length ? ` / ${chain.rows.length}` : ''} strikes
          </Text>
        </View>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <OrderBottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onOrderPlaced={handleOrderResult}
        instrument={sheetInstrument}
        defaultSide={sheetSide}
      />
      <RejectionReasonModal
        visible={rejectionVisible}
        reason={rejectionReason}
        orderInfo={rejectionOrderInfo}
        onClose={() => setRejectionVisible(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    backgroundColor: '#FFFFFF',
  },
  backBtn:      { padding: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: '#0f172a', letterSpacing: -0.3 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  liveDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10b981' },
  liveLabel:    { fontSize: 10, fontWeight: '800', color: '#10b981', letterSpacing: 0.5 },
  refreshBtn:   { padding: 8, borderRadius: 20, backgroundColor: '#eff6ff', marginLeft: 4 },

  // Index bar
  indexBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    paddingVertical: 8,
    maxHeight: 84,
  },
  indexPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
    backgroundColor: '#f1f5f9', alignItems: 'center', minWidth: 80,
  },
  indexPillActive:     { backgroundColor: '#1A73E8' },
  indexPillName:       { fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 0.3, marginBottom: 2 },
  indexPillNameActive: { color: '#fff' },
  indexPillPrice:      { fontSize: 13, fontWeight: '800', marginBottom: 1 },
  indexPillChg:        { fontSize: 9, fontWeight: '600' },

  // Price banner
  priceBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    borderLeftWidth: 4,
  },
  priceBannerLeft: { gap: 4 },
  priceBannerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priceBannerName: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5 },
  priceBannerMain: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  changePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  changePillText:  { fontSize: 11, fontWeight: '700' },
  priceBannerRight: { alignItems: 'flex-end' },
  atmLabel:        { fontSize: 10, color: '#94a3b8', fontWeight: '600', marginBottom: 2 },
  atmValue:        { fontSize: 16, fontWeight: '800', color: '#d97706' },

  // Expiry bar
  expiryBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    backgroundColor: '#FFFFFF', gap: 10,
  },
  expiryLabel: { fontSize: 9, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.8, minWidth: 46 },
  expiryChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, backgroundColor: '#f1f5f9',
    borderWidth: 1, borderColor: 'transparent',
  },
  expiryChipActive:    { backgroundColor: '#eff6ff', borderColor: '#1A73E8' },
  expiryChipText:      { fontSize: 12, fontWeight: '600', color: '#64748b' },
  expiryChipTextActive:{ color: '#1A73E8', fontWeight: '700' },
  expirySkeleton:      { width: 72, height: 30, borderRadius: 10, backgroundColor: '#e2e8f0' },

  // Column headers
  colHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    backgroundColor: '#fafafa',
  },
  ceHeader: { flex: 1, paddingHorizontal: 10, paddingVertical: 6 },
  peHeader: { flex: 1, paddingHorizontal: 10, paddingVertical: 6 },
  strikeHeader: {
    width: 72, justifyContent: 'center', alignItems: 'center',
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 6,
  },
  strikeHeaderText: { fontSize: 9, fontWeight: '800', color: '#0f172a', letterSpacing: 0.5 },
  ceLabel: { marginBottom: 2 },
  ceLabelText: { fontSize: 9, fontWeight: '800', color: '#3b82f6', letterSpacing: 0.5 },
  peLabel: { marginBottom: 2 },
  peLabelText: { fontSize: 9, fontWeight: '800', color: '#ef4444', letterSpacing: 0.5 },
  subHeaders: { flexDirection: 'row', justifyContent: 'space-between' },
  subHdr: { fontSize: 9, fontWeight: '600', color: '#94a3b8' },

  // States
  state: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 80 },
  stateIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  stateTitle:    { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  stateSubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20, marginHorizontal: 40 },
  stateText:     { fontSize: 13, color: '#64748b', marginTop: 10 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1A73E8', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Status bar
  statusBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
  },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  statusText:   { fontSize: 11, color: '#94a3b8', fontWeight: '500' },

  toggleStrikesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  toggleStrikesText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
});
