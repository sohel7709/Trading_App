import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';
import CandlestickChart from '../components/CandlestickChart';

const { width } = Dimensions.get('window');

const INTERVALS = [
  { label: '1m',  value: '1m'  },
  { label: '3m',  value: '3m'  },
  { label: '5m',  value: '5m'  },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h',  value: '1h'  },
  { label: '1D',  value: '1d'  },
  { label: '1W',  value: '1d'  },
  { label: '1M',  value: '1d'  },
];

export default function StockDetailScreen({ route, navigation }) {
  const { symbol } = route.params;
  const [quote, setQuote] = useState(route.params || {});
  const [candles, setCandles] = useState([]);
  const [activeInterval, setActiveInterval] = useState('15m');
  const [candleInterval, setCandleInterval] = useState('15m');
  const [chartLoading, setChartLoading] = useState(true);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const insets = useSafeAreaInsets();

  const fetchQuote = async () => {
    try {
      const q = await api.getQuote(symbol);
      if (q) setQuote(q);
    } catch {}
  };

  const fetchCandles = async (ivl) => {
    setChartLoading(true);
    setCandles([]);
    try {
      const res = await api.getCandles(symbol, ivl);
      setCandles(res.candles || []);
    } catch {}
    finally { setChartLoading(false); }
  };

  useEffect(() => {
    fetchQuote();
    fetchCandles(candleInterval);

    const socket = getSocket();
    const handler = (data) => {
      if (data.prices?.[symbol]) setQuote(prev => ({ ...prev, ...data.prices[symbol] }));
    };
    socket.on('marketData', handler);
    return () => socket.off('marketData', handler);
  }, [symbol]);

  const changeInterval = (label, value) => {
    setActiveInterval(label);
    setCandleInterval(value);
    fetchCandles(value);
  };

  const ltp = quote?.ltp ?? quote?.price ?? 0;
  const change = quote?.change ?? 0;
  const changePercent = quote?.changePercent ?? 0;
  const open = quote?.open ?? 0;
  const high = quote?.high ?? 0;
  const low = quote?.low ?? 0;
  const prevClose = quote?.close ?? quote?.prevClose ?? quote?.previousClose ?? 0;
  const volume = quote?.volume ?? 0;
  const isGain = change >= 0;
  const priceColor = isGain ? '#25B87E' : '#E64D3D';

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

        <View style={styles.headerCenter}>
          <Text style={styles.headerSymbol}>{symbol}</Text>
          <View style={styles.exchangeBadge}>
            <Text style={styles.exchangeBadgeText}>NSE</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('Alerts')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="notifications-outline" size={20} color="#1E1E1E" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setIsWatchlisted(p => !p)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isWatchlisted ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={isWatchlisted ? '#387ED1' : '#1E1E1E'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 76 + insets.bottom }}
      >
        {/* ── Price section ── */}
        <View style={styles.priceSection}>
          <Text style={[styles.ltp, { color: priceColor }]}>
            ₹{Number(ltp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <View style={styles.changeRow}>
            <Ionicons
              name={isGain ? 'caret-up' : 'caret-down'}
              size={13}
              color={priceColor}
            />
            <Text style={[styles.changeAbs, { color: priceColor }]}>
              {isGain ? '+' : ''}{Number(change).toFixed(2)}
            </Text>
            <Text style={[styles.changePct, { color: priceColor }]}>
              ({isGain ? '+' : ''}{Number(changePercent).toFixed(2)}%)
            </Text>
            <Text style={styles.changeDate}>Today</Text>
          </View>
        </View>

        {/* ── Candlestick chart ── */}
        <View style={styles.chartContainer}>
          {chartLoading ? (
            <View style={[styles.chartPlaceholder, { width, height: 280 }]}>
              <ActivityIndicator color="#387ED1" />
              <Text style={styles.chartLoadingTxt}>Loading chart…</Text>
            </View>
          ) : (
            <CandlestickChart
              candles={candles}
              width={width}
              height={280}
              isGain={isGain}
            />
          )}
        </View>

        {/* ── Interval tabs ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.intervalRow}
          contentContainerStyle={styles.intervalContent}
        >
          {INTERVALS.map(({ label, value }) => (
            <TouchableOpacity
              key={label}
              style={styles.intervalBtn}
              onPress={() => changeInterval(label, value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.intervalTxt, activeInterval === label && styles.intervalTxtActive]}>
                {label}
              </Text>
              {activeInterval === label && <View style={styles.intervalUnderline} />}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── OHLC card ── */}
        <View style={styles.card}>
          <View style={styles.ohlcGrid}>
            {[
              { label: 'Open', value: open, color: '#1E1E1E' },
              { label: 'High', value: high, color: '#25B87E' },
              { label: 'Low', value: low, color: '#E64D3D' },
              { label: 'Prev. Close', value: prevClose, color: '#1E1E1E' },
            ].map(({ label, value, color }) => (
              <View key={label} style={styles.ohlcItem}>
                <Text style={styles.ohlcLabel}>{label}</Text>
                <Text style={[styles.ohlcValue, { color }]}>
                  ₹{Number(value).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>

          {/* Day range bar */}
          {high > 0 && low > 0 && ltp > 0 && high !== low && (
            <View style={styles.rangeBar}>
              <Text style={styles.rangeLow}>₹{Number(low).toFixed(0)}</Text>
              <View style={styles.rangeTrack}>
                <View
                  style={[
                    styles.rangeFill,
                    { width: `${Math.min(100, ((ltp - low) / (high - low)) * 100)}%` },
                  ]}
                />
                <View
                  style={[
                    styles.rangeDot,
                    { left: `${Math.min(96, ((ltp - low) / (high - low)) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.rangeHigh}>₹{Number(high).toFixed(0)}</Text>
            </View>
          )}
        </View>

        {/* ── Market stats card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Market stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Volume</Text>
              <Text style={styles.statValue}>
                {volume >= 1e7
                  ? `${(volume / 1e7).toFixed(2)} Cr`
                  : volume >= 1e5
                  ? `${(volume / 1e5).toFixed(2)} L`
                  : Number(volume).toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>52W High</Text>
              <Text style={[styles.statValue, { color: '#25B87E' }]}>
                ₹{Number(quote?.high52w ?? high * 1.12).toFixed(2)}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>52W Low</Text>
              <Text style={[styles.statValue, { color: '#E64D3D' }]}>
                ₹{Number(quote?.low52w ?? low * 0.88).toFixed(2)}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Avg. Price</Text>
              <Text style={styles.statValue}>
                ₹{Number((high + low) / 2).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Fundamentals card (placeholder) ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fundamentals</Text>
          <View style={styles.statsGrid}>
            {[
              { label: 'Market cap', value: '—' },
              { label: 'P/E ratio', value: '—' },
              { label: 'EPS (TTM)', value: '—' },
              { label: 'Div. yield', value: '—' },
              { label: 'Book value', value: '—' },
              { label: 'ROE', value: '—' },
            ].map(({ label, value }) => (
              <View key={label} style={styles.statItem}>
                <Text style={styles.statLabel}>{label}</Text>
                <Text style={styles.statValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── Fixed footer: SELL | BUY ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity
          style={styles.sellBtn}
          onPress={() => navigation.navigate('OrderEntry', { symbol, ltp, defaultSide: 'SELL' })}
          activeOpacity={0.88}
        >
          <Text style={styles.footerBtnText}>SELL</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buyBtn}
          onPress={() => navigation.navigate('OrderEntry', { symbol, ltp, defaultSide: 'BUY' })}
          activeOpacity={0.88}
        >
          <Text style={styles.footerBtnText}>BUY</Text>
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
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerBtn: { padding: 8, width: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerSymbol: { fontSize: 16, fontWeight: '700', color: '#1E1E1E' },
  exchangeBadge: {
    backgroundColor: '#F1F3F4',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  exchangeBadgeText: { fontSize: 10, fontWeight: '600', color: '#738390' },
  headerRight: { flexDirection: 'row' },

  // ── Price section ──
  priceSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  ltp: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  changeAbs: { fontSize: 14, fontWeight: '500' },
  changePct: { fontSize: 14, fontWeight: '500' },
  changeDate: { fontSize: 12, color: '#B3BBBF', marginLeft: 4 },

  // ── Chart ──
  chartContainer: { backgroundColor: '#FFFFFF' },
  chartPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  chartLoadingTxt: { fontSize: 13, color: '#B3BBBF' },

  // ── Interval tabs ──
  intervalRow: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E8E8E8',
    flexGrow: 0,
  },
  intervalContent: {
    alignItems: 'center',
  },
  intervalBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    position: 'relative',
  },
  intervalTxt: { fontSize: 12, fontWeight: '600', color: '#738390' },
  intervalTxtActive: { color: '#387ED1' },
  intervalUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#387ED1',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // ── Cards ──
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 8,
    padding: 14,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E1E1E',
    marginBottom: 12,
  },

  // ── OHLC ──
  ohlcGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  ohlcItem: { flex: 1, alignItems: 'center' },
  ohlcLabel: { fontSize: 10, color: '#B3BBBF', marginBottom: 4, letterSpacing: 0.2 },
  ohlcValue: { fontSize: 13, fontWeight: '700' },

  rangeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  rangeLow: { fontSize: 11, color: '#738390', width: 46, textAlign: 'right' },
  rangeHigh: { fontSize: 11, color: '#738390', width: 46 },
  rangeTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#E8E8E8',
    borderRadius: 2,
    position: 'relative',
  },
  rangeFill: { height: '100%', backgroundColor: '#387ED1', borderRadius: 2 },
  rangeDot: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#387ED1',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  // ── Stats grid ──
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statItem: { width: '50%', paddingVertical: 8, paddingRight: 8 },
  statLabel: { fontSize: 11, color: '#B3BBBF', marginBottom: 3 },
  statValue: { fontSize: 13, fontWeight: '600', color: '#1E1E1E' },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    height: 52,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  sellBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E64D3D',
  },
  buyBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#25B87E',
  },
  footerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
