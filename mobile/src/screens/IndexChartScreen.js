import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, ActivityIndicator, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';
import CandlestickChart from '../components/CandlestickChart';

const { width } = Dimensions.get('window');

const INDICES = [
  { name: 'NIFTY 50',   short: 'NIFTY' },
  { name: 'BANK NIFTY', short: 'BANKNIFTY' },
  { name: 'SENSEX',     short: 'SENSEX' },
  { name: 'FINNIFTY',   short: 'FINNIFTY' },
  { name: 'NIFTY IT',   short: 'NIFTY IT' },
];

const INTERVALS = [
  { label: '1m',  value: '1m',  days: 1,   apiInterval: '1m'  },
  { label: '3m',  value: '3m',  days: 1,   apiInterval: '3m'  },
  { label: '5m',  value: '5m',  days: 1,   apiInterval: '5m'  },
  { label: '15m', value: '15m', days: 7,   apiInterval: '15m' },
  { label: '30m', value: '30m', days: 7,   apiInterval: '30m' },
  { label: '1h',  value: '1h',  days: 30,  apiInterval: '1h'  },
  { label: '1D',  value: '1d',  days: 90,  apiInterval: '1d'  },
  { label: '1W',  value: '1d',  days: 180, apiInterval: '1d'  },
  { label: '1M',  value: '1d',  days: 365, apiInterval: '1d'  },
];

// ─── Candlestick Pattern Detector ────────────────────────────────
function detectPatterns(candles) {
  if (!candles || candles.length < 3) return [];
  const patterns = [];
  const last   = candles[candles.length - 1];
  const prev   = candles[candles.length - 2];
  const prev2  = candles[candles.length - 3];
  if (!last || !prev) return [];

  const body    = c => Math.abs(c.close - c.open);
  const range   = c => c.high - c.low;
  const isUp    = c => c.close >= c.open;
  const upperWick = c => c.high - Math.max(c.open, c.close);
  const lowerWick = c => Math.min(c.open, c.close) - c.low;

  // Doji — body < 10% of range
  if (range(last) > 0 && body(last) / range(last) < 0.1) {
    patterns.push({ name: 'Doji', type: 'neutral', desc: 'Market indecision — potential reversal signal', icon: 'remove' });
  }

  // Hammer — small body at top, lower wick ≥ 2× body, tiny upper wick
  if (lowerWick(last) >= body(last) * 2 && upperWick(last) <= body(last) * 0.5 && body(last) > 0) {
    patterns.push({ name: isUp(prev) ? 'Hanging Man' : 'Hammer', type: isUp(prev) ? 'bearish' : 'bullish', desc: isUp(prev) ? 'Bearish reversal at resistance' : 'Bullish reversal — potential bottom', icon: isUp(prev) ? 'arrow-down' : 'arrow-up' });
  }

  // Shooting Star — small body at bottom, upper wick ≥ 2× body
  if (upperWick(last) >= body(last) * 2 && lowerWick(last) <= body(last) * 0.5 && body(last) > 0) {
    patterns.push({ name: 'Shooting Star', type: 'bearish', desc: 'Bearish reversal — selling pressure at high', icon: 'arrow-down' });
  }

  // Inverted Hammer
  if (upperWick(last) >= body(last) * 2 && lowerWick(last) <= body(last) * 0.5 && !isUp(prev)) {
    patterns.push({ name: 'Inverted Hammer', type: 'bullish', desc: 'Potential bullish reversal signal', icon: 'arrow-up' });
  }

  // Bullish Engulfing
  if (!isUp(prev) && isUp(last) && last.open < prev.close && last.close > prev.open && body(last) > body(prev)) {
    patterns.push({ name: 'Bullish Engulfing', type: 'bullish', desc: 'Strong bullish reversal — buyers in control', icon: 'trending-up' });
  }

  // Bearish Engulfing
  if (isUp(prev) && !isUp(last) && last.open > prev.close && last.close < prev.open && body(last) > body(prev)) {
    patterns.push({ name: 'Bearish Engulfing', type: 'bearish', desc: 'Strong bearish reversal — sellers taking over', icon: 'trending-down' });
  }

  // Marubozu (strong trend candle, body > 80% of range)
  if (range(last) > 0 && body(last) / range(last) > 0.80) {
    patterns.push({ name: isUp(last) ? 'Bullish Marubozu' : 'Bearish Marubozu', type: isUp(last) ? 'bullish' : 'bearish', desc: isUp(last) ? 'Strong buying momentum, no upper wick resistance' : 'Strong selling momentum, no lower wick support', icon: isUp(last) ? 'trending-up' : 'trending-down' });
  }

  // Morning Star (3-candle)
  if (prev2 && !isUp(prev2) && body(prev) < body(prev2) * 0.4 && isUp(last) && last.close > (prev2.open + prev2.close) / 2) {
    patterns.push({ name: 'Morning Star', type: 'bullish', desc: '3-candle bullish reversal at the bottom', icon: 'sunny' });
  }

  // Evening Star (3-candle)
  if (prev2 && isUp(prev2) && body(prev) < body(prev2) * 0.4 && !isUp(last) && last.close < (prev2.open + prev2.close) / 2) {
    patterns.push({ name: 'Evening Star', type: 'bearish', desc: '3-candle bearish reversal at the top', icon: 'moon' });
  }

  // Three White Soldiers (3 strong green candles)
  if (prev2 && isUp(prev2) && isUp(prev) && isUp(last) &&
      body(last) > range(last) * 0.6 && body(prev) > range(prev) * 0.6 && body(prev2) > range(prev2) * 0.6) {
    patterns.push({ name: 'Three White Soldiers', type: 'bullish', desc: 'Three consecutive strong bullish candles — strong uptrend', icon: 'trending-up' });
  }

  // Three Black Crows (3 strong red candles)
  if (prev2 && !isUp(prev2) && !isUp(prev) && !isUp(last) &&
      body(last) > range(last) * 0.6 && body(prev) > range(prev) * 0.6 && body(prev2) > range(prev2) * 0.6) {
    patterns.push({ name: 'Three Black Crows', type: 'bearish', desc: 'Three consecutive strong bearish candles — strong downtrend', icon: 'trending-down' });
  }

  return patterns;
}

// ─── Pattern Card Component ───────────────────────────────────────
function PatternCard({ pattern }) {
  const bg    = pattern.type === 'bullish' ? '#E8F8F2' : pattern.type === 'bearish' ? '#FDECEA' : '#FFF9E6';
  const color = pattern.type === 'bullish' ? colors.gain : pattern.type === 'bearish' ? colors.loss : '#B45309';
  return (
    <View style={[styles.patternCard, { backgroundColor: bg, borderColor: color + '44' }]}>
      <View style={[styles.patternIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={pattern.icon} size={14} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.patternName, { color }]}>{pattern.name}</Text>
        <Text style={styles.patternDesc}>{pattern.desc}</Text>
      </View>
      <View style={[styles.patternTypeBadge, { backgroundColor: color + '22' }]}>
        <Text style={[styles.patternTypeText, { color }]}>{pattern.type.toUpperCase()}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────
export default function IndexChartScreen({ route, navigation }) {
  const initIndex = route?.params?.indexName || 'NIFTY 50';
  const [selectedIndex, setSelectedIndex] = useState(initIndex);
  const [quote, setQuote] = useState({});
  const [candles, setCandles] = useState([]);
  const [activeInterval, setActiveInterval] = useState('15m');
  const [apiInterval, setApiInterval] = useState('15m');
  const [chartLoading, setChartLoading] = useState(true);
  const [livePrice, setLivePrice] = useState(null);
  const [patterns, setPatterns] = useState([]);
  const [dataSource, setDataSource] = useState('');
  const insets = useSafeAreaInsets();
  const chartRef = useRef(null);
  const flashAnim = useRef(new Animated.Value(1)).current;
  const prevPriceRef = useRef(null);

  const fetchCandles = useCallback(async (idxName, ivl) => {
    setChartLoading(true);
    setCandles([]);
    try {
      const res = await api.getIndexCandles(idxName, ivl);
      const c = res.candles || [];
      setCandles(c);
      setPatterns(detectPatterns(c));
      if (res.quote?.ltp) {
        setQuote(res.quote);
        setLivePrice(res.quote.ltp);
        prevPriceRef.current = res.quote.ltp;
      }
      if (res.source) setDataSource(res.source);
    } catch (e) {
      console.warn('IndexChart fetch error:', e.message);
    } finally {
      setChartLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchCandles(selectedIndex, apiInterval);
  }, [selectedIndex, apiInterval]));

  // Auto-refresh every 30s for intraday intervals
  useEffect(() => {
    if (!['1m', '3m', '5m', '15m', '30m', '1h'].includes(apiInterval)) return;
    const t = setInterval(() => fetchCandles(selectedIndex, apiInterval), 30000);
    return () => clearInterval(t);
  }, [selectedIndex, apiInterval]);

  // Live socket price updates
  useEffect(() => {
    const socket = getSocket();
    const handler = (data) => {
      if (data.source) setDataSource(data.source);
      if (!data.indexes) return;
      const d = data.indexes[selectedIndex];
      if (!d?.ltp) return;
      const price = d.ltp;
      setQuote(d);
      setLivePrice(price);

      if (prevPriceRef.current !== null && price !== prevPriceRef.current) {
        flashAnim.setValue(0.4);
        Animated.timing(flashAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      }
      prevPriceRef.current = price;

      if (chartRef.current) chartRef.current.updateLivePrice(price);

      // Re-run pattern detection on updated last candle
      if (candles.length > 0) {
        const updated = [...candles];
        const last = { ...updated[updated.length - 1] };
        last.close = price;
        last.high = Math.max(last.high, price);
        last.low  = Math.min(last.low, price);
        updated[updated.length - 1] = last;
        setPatterns(detectPatterns(updated));
      }
    };
    socket.on('marketData', handler);
    return () => socket.off('marketData', handler);
  }, [selectedIndex, candles]);

  const switchIndex = (name) => {
    if (name === selectedIndex) return;
    setSelectedIndex(name);
    setCandles([]); setQuote({}); setLivePrice(null); setPatterns([]);
    fetchCandles(name, apiInterval);
  };

  const changeInterval = (item) => {
    setActiveInterval(item.label);
    setApiInterval(item.apiInterval);
    fetchCandles(selectedIndex, item.apiInterval);
  };

  const ltp    = quote?.ltp ?? livePrice ?? 0;
  const change = quote?.change ?? 0;
  const chgPct = quote?.changePercent ?? 0;
  const open   = quote?.open ?? 0;
  const high   = quote?.high ?? 0;
  const low    = quote?.low  ?? 0;
  const isGain = change >= 0;
  const priceColor = isGain ? colors.gain : colors.loss;

  const isLive = dataSource.includes('LIVE') || dataSource.includes('GROWW') || dataSource === 'NSE+GROWW';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Index Charts</Text>
        {isLive && (
          <View style={styles.liveHeaderBadge}>
            <View style={styles.livePulse} />
            <Text style={styles.liveHeaderText}>LIVE</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.ocBtn}
          onPress={() => navigation.navigate('OptionChain', { indexName: selectedIndex })}
        >
          <Text style={styles.ocBtnText}>Option Chain</Text>
        </TouchableOpacity>
      </View>

      {/* Index selector tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.indexBar} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {INDICES.map(idx => (
          <TouchableOpacity
            key={idx.name}
            style={[styles.indexPill, selectedIndex === idx.name && styles.indexPillActive]}
            onPress={() => switchIndex(idx.name)}
          >
            <Text style={[styles.indexPillText, selectedIndex === idx.name && styles.indexPillTextActive]}>
              {idx.short}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Live price */}
        <View style={styles.priceSection}>
          <Text style={styles.indexLabel}>{selectedIndex}</Text>
          <Animated.Text style={[styles.ltp, { color: priceColor, opacity: flashAnim }]}>
            {Number(ltp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Animated.Text>
          <View style={styles.changeRow}>
            <Ionicons name={isGain ? 'caret-up' : 'caret-down'} size={14} color={priceColor} />
            <Text style={[styles.changeVal, { color: priceColor }]}>
              {isGain ? '+' : ''}{Number(change).toFixed(2)}
            </Text>
            <Text style={[styles.changePct, { color: priceColor }]}>
              ({isGain ? '+' : ''}{Number(chgPct).toFixed(2)}%)
            </Text>
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartWrap}>
          {chartLoading ? (
            <View style={[styles.chartLoader, { height: 290 }]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.chartLoaderText}>Loading {selectedIndex}…</Text>
            </View>
          ) : (
            <CandlestickChart
              ref={chartRef}
              candles={candles}
              width={width}
              height={290}
              isGain={isGain}
              livePrice={livePrice}
            />
          )}

          {/* Interval selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.intervalRow}
            contentContainerStyle={styles.intervalContent}
          >
            {INTERVALS.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.intervalBtn, activeInterval === item.label && styles.intervalBtnActive]}
                onPress={() => changeInterval(item)}
              >
                <Text style={[styles.intervalTxt, activeInterval === item.label && styles.intervalTxtActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* OHLC card */}
        <View style={styles.ohlcCard}>
          {[
            { label: 'Open',  value: open, color: colors.text },
            { label: 'High',  value: high, color: colors.gain },
            { label: 'Low',   value: low,  color: colors.loss },
            { label: 'Prev Close', value: quote?.previousClose ?? 0, color: colors.textSecondary },
          ].map(({ label, value, color }) => (
            <View key={label} style={styles.ohlcItem}>
              <Text style={styles.ohlcLabel}>{label}</Text>
              <Text style={[styles.ohlcValue, { color }]}>
                {Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          ))}
        </View>

        {/* Day range bar */}
        {high > 0 && low > 0 && ltp > 0 && high !== low && (
          <View style={styles.rangeRow}>
            <Text style={styles.rangeLow}>{Number(low).toFixed(0)}</Text>
            <View style={styles.rangeTrack}>
              <View style={[styles.rangeFill, { width: `${Math.min(100, Math.max(0, ((ltp - low) / (high - low)) * 100))}%` }]} />
              <View style={[styles.rangeDot, { left: `${Math.min(96, Math.max(0, ((ltp - low) / (high - low)) * 100))}%` }]} />
            </View>
            <Text style={styles.rangeHigh}>{Number(high).toFixed(0)}</Text>
          </View>
        )}

        {/* ── Candlestick Pattern Detection ── */}
        <View style={styles.patternSection}>
          <View style={styles.patternHeader}>
            <Ionicons name="analytics-outline" size={16} color={colors.text} />
            <Text style={styles.patternHeaderText}>Candlestick Patterns</Text>
            {candles.length > 0 && (
              <Text style={styles.patternSubtext}>Last {candles.length} candles analysed</Text>
            )}
          </View>

          {chartLoading ? (
            <View style={styles.patternLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : patterns.length > 0 ? (
            <View style={styles.patternList}>
              {patterns.map((p, i) => <PatternCard key={i} pattern={p} />)}
            </View>
          ) : (
            <View style={styles.noPattern}>
              <Ionicons name="checkmark-circle-outline" size={28} color={colors.textMuted} />
              <Text style={styles.noPatternText}>No strong patterns detected</Text>
              <Text style={styles.noPatternSub}>Market is in consolidation or trending steadily</Text>
            </View>
          )}
        </View>

        {/* All indices summary */}
        <AllIndicesSummary currentIndex={selectedIndex} onPress={switchIndex} />
      </ScrollView>
    </View>
  );
}

// ─── All-Indices Summary ──────────────────────────────────────────
function AllIndicesSummary({ currentIndex, onPress }) {
  const [indexes, setIndexes] = useState({});

  useEffect(() => {
    api.getIndexes().then(r => { if (r?.indexes) setIndexes(r.indexes); }).catch(() => {});
    const socket = getSocket();
    const h = (d) => { if (d.indexes) setIndexes(d.indexes); };
    socket.on('marketData', h);
    return () => socket.off('marketData', h);
  }, []);

  const SHOW = ['NIFTY 50', 'BANK NIFTY', 'SENSEX', 'FINNIFTY', 'NIFTY IT', 'INDIA VIX'];

  return (
    <View style={styles.allCard}>
      <Text style={styles.allTitle}>All Indices</Text>
      {SHOW.map(name => {
        const d = indexes[name] || {};
        const isUp = (d.change ?? 0) >= 0;
        const isCurrent = name === currentIndex;
        return (
          <TouchableOpacity key={name} style={[styles.allRow, isCurrent && styles.allRowActive]} onPress={() => onPress(name)}>
            <Text style={[styles.allName, isCurrent && { color: colors.primary, fontWeight: '700' }]}>{name}</Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.allLtp, { color: isUp ? colors.gain : colors.loss }]}>
              {d.ltp ? Number(d.ltp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
            </Text>
            <Text style={[styles.allChange, { color: isUp ? colors.gain : colors.loss }]}>
              {isUp ? '+' : ''}{Number(d.changePercent ?? 0).toFixed(2)}%
            </Text>
            <Ionicons name={isUp ? 'trending-up' : 'trending-down'} size={13} color={isUp ? colors.gain : colors.loss} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  liveHeaderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E8F8F2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  livePulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gain },
  liveHeaderText: { fontSize: 10, fontWeight: '800', color: colors.gain, letterSpacing: 0.5 },
  ocBtn: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  ocBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  indexBar: { flexGrow: 0, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  indexPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  indexPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  indexPillText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  indexPillTextActive: { color: '#fff' },

  priceSection: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  indexLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4, letterSpacing: 0.3 },
  ltp: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  changeVal: { fontSize: 14, fontWeight: '500' },
  changePct: { fontSize: 14, fontWeight: '500' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8, backgroundColor: '#E8F8F2', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gain },
  liveText: { fontSize: 9, fontWeight: '800', color: colors.gain, letterSpacing: 0.5 },

  chartWrap: { backgroundColor: '#fff' },
  chartLoader: { width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, gap: 10 },
  chartLoaderText: { fontSize: 13, color: colors.textMuted },
  intervalRow: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, flexGrow: 0 },
  intervalContent: { paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  intervalBtn: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 6, marginRight: 4 },
  intervalBtnActive: { backgroundColor: '#EFF6FF' },
  intervalTxt: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  intervalTxtActive: { color: colors.primary, fontWeight: '700' },
  sourceNote: { fontSize: 10, color: colors.textMuted, textAlign: 'center', paddingVertical: 5 },

  ohlcCard: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 14, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  ohlcItem: { alignItems: 'center' },
  ohlcLabel: { fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  ohlcValue: { fontSize: 12, fontWeight: '700' },

  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10 },
  rangeLow:  { fontSize: 11, color: colors.textMuted, width: 52, textAlign: 'right' },
  rangeHigh: { fontSize: 11, color: colors.textMuted, width: 52 },
  rangeTrack: { flex: 1, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, position: 'relative' },
  rangeFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  rangeDot: {
    position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.primary, borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2,
  },

  // Patterns
  patternSection: { margin: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  patternHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  patternHeaderText: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  patternSubtext: { fontSize: 11, color: colors.textMuted },
  patternList: { padding: 10, gap: 8 },
  patternLoading: { padding: 24, alignItems: 'center' },
  patternCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1 },
  patternIcon: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  patternName: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  patternDesc: { fontSize: 11, color: colors.textSecondary, lineHeight: 15 },
  patternTypeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  patternTypeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  noPattern: { padding: 24, alignItems: 'center', gap: 6 },
  noPatternText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  noPatternSub: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  // All indices
  allCard: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  allTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 10 },
  allRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  allRowActive: { backgroundColor: '#F0F7FF', marginHorizontal: -14, paddingHorizontal: 14 },
  allName: { fontSize: 13, fontWeight: '500', color: colors.text },
  allLtp: { fontSize: 13, fontWeight: '700', marginRight: 8 },
  allChange: { fontSize: 12, fontWeight: '600', width: 58, textAlign: 'right' },
});
