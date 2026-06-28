import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';
import IndexTicker from '../components/IndexTicker';

// ─── Helpers ────────────────────────────────────────────────────
const fmt2  = (n) => Number(n ?? 0).toFixed(2);
const fmtINR = (n) =>
  Number(Math.abs(n ?? 0)).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

// Exchange label — exactly as shown in real Kite screenshot
const getExchange = (symbol = '') => {
  const s = symbol.toUpperCase();
  if (/^SENSEX|^BANKEX/.test(s) && /CE$|PE$|FUT$/.test(s)) return 'BFO';
  if (/CE$|PE$|FUT$/.test(s)) return 'NFO';
  if (/^BSE/.test(s)) return 'BSE';
  return 'EQ';   // equity position
};

// Badge colours — exact from real Kite screenshot
const BADGE = {
  NRML: { bg: '#EDE9FE', text: '#7C3AED' },   // purple
  MIS:  { bg: '#FFF7ED', text: '#EA580C' },   // orange (Kite shows orange for MIS)
  CNC:  { bg: '#F3F4F6', text: '#6B7280' },   // gray
};

export default function PortfolioScreen({ navigation }) {
  const [tab, setTab]               = useState(0);
  const [holdings, setHoldings]     = useState([]);
  const [positions, setPositions]   = useState([]);   // open net positions
  const [dayPositions, setDayPos]   = useState([]);   // today's traded contracts
  const [dayPnl, setDayPnl]         = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [indexes, setIndexes]       = useState({});
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [flashMsg, setFlashMsg]     = useState(null);
  const insets = useSafeAreaInsets();

  // ── Data fetch ──────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const [h, p, dp] = await Promise.all([
        api.getHoldings(),
        api.getPositions(),
        api.getDayPositions(),
      ]);
      setHoldings(h);
      setPositions(p);
      setDayPos(dp.positions || []);
      setDayPnl(dp.totalPnl || 0);
    } catch (e) { console.warn(e.message); }
    finally { setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  // ── Live socket updates ─────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    // initialData fires once on socket connect — populates all state
    // immediately without waiting for the first API call to complete.
    const onInitialData = (data) => {
      if (data.holdings)  setHoldings(data.holdings);
      if (data.positions) setPositions(data.positions);
    };
    socket.on('initialData', onInitialData);

    const onOrderExecuted = (data) => {
      if (data.positions) setPositions(data.positions);
      if (data.holdings) {
        // Merge incoming DB holdings with current live ltps so current value
        // updates instantly without waiting for the next marketData tick.
        setHoldings(prev => {
          const ltpMap = {};
          prev.forEach(h => { ltpMap[h.stockSymbol] = h.ltp; });
          return data.holdings.map(h => ({
            ...h,
            ltp: ltpMap[h.stockSymbol] ?? h.ltp,
          }));
        });
      }
      if (data.order) {
        setFlashMsg(`${data.order.side} ${data.order.stockSymbol} executed`);
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 0, duration: 2500, useNativeDriver: true }),
        ]).start();
      }
    };
    const onMarketData = (data) => {
      if (data.indexes) setIndexes(data.indexes);
      if (!data.prices) return;
      setHoldings(prev => prev.map(h => {
        const p = data.prices[h.stockSymbol];
        return p ? { ...h, ltp: p.ltp ?? h.ltp } : h;
      }));
      // Live mark-to-market for open day positions: re-price the net open
      // quantity and recompute total P&L = realized + unrealized.
      setDayPos(prev => prev.map(pos => {
        const p = data.prices[pos.stockSymbol];
        if (!p || p.ltp == null || pos.isSquaredOff) return pos;
        const ltp   = p.ltp;
        const netQty = pos.netQty ?? 0;
        let unrealized = 0;
        if (netQty > 0)      unrealized = (ltp - pos.avgPrice) * netQty;
        else if (netQty < 0) unrealized = (pos.sellAvg - ltp) * (-netQty);
        const realized = pos.realizedPnl ?? 0;
        return { ...pos, ltp, unrealizedPnl: unrealized, pnl: realized + unrealized };
      }));
    };
    socket.on('orderExecuted', onOrderExecuted);
    socket.on('marketData', onMarketData);
    return () => {
      socket.off('initialData', onInitialData);
      socket.off('orderExecuted', onOrderExecuted);
      socket.off('marketData', onMarketData);
    };
  }, []);

  // ── Holdings P&L summary (3-col kite-pnl style) ─────────────────
  const invested  = holdings.reduce((s, h) => s + h.avgPrice * h.quantity, 0);
  const current   = holdings.reduce((s, h) => s + h.ltp * h.quantity, 0);
  const hPnl      = current - invested;
  const hPnlGain  = hPnl >= 0;
  const hPnlPct   = invested > 0 ? (hPnl / invested) * 100 : 0;

  // Positions Total P&L — derived so live (socket) re-pricing keeps it fresh.
  const totalDayPnl = dayPositions.length
    ? dayPositions.reduce((s, p) => s + (p.pnl ?? 0), 0)
    : dayPnl;

  // Split number into whole + decimal for kite-pnl.png style
  const splitNum = (n) => {
    const s = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const [w, d] = s.split('.');
    return { w, d: d ?? '00' };
  };

  // ── Render: Holdings row ────────────────────────────────────────
  const renderHolding = ({ item }) => {
    const pnl      = (item.ltp - item.avgPrice) * item.quantity;
    const isGain   = pnl >= 0;
    const badge    = BADGE[item.productType] ?? BADGE.CNC;
    const exchange = 'EQ';

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('StockDetail', { symbol: item.stockSymbol, ltp: item.ltp })}
        activeOpacity={0.75}
      >
        <View style={styles.rowLine1}>
          <Text style={styles.rowMeta}>
            <Text style={styles.metaLabel}>Qty. </Text>
            <Text style={styles.metaQty}>{item.quantity}</Text>
            {'   '}
            <Text style={styles.metaLabel}>Avg. </Text>
            <Text style={styles.metaVal}>{fmt2(item.avgPrice)}</Text>
          </Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeTxt, { color: badge.text }]}>
              {item.productType ?? 'CNC'}
            </Text>
          </View>
        </View>

        <View style={styles.rowLine2}>
          <Text style={styles.rowSymbol} numberOfLines={1}>{item.stockSymbol}</Text>
          <Text style={[styles.rowPnl, { color: isGain ? colors.gain : colors.loss }]}>
            {isGain ? '+' : '-'}{fmtINR(pnl)}
          </Text>
        </View>

        <View style={styles.rowLine3}>
          <Text style={styles.rowExchange}>{exchange}</Text>
          <Text style={styles.rowLtp}>
            <Text style={styles.ltpLabel}>LTP </Text>
            {fmt2(item.ltp)}
          </Text>
        </View>

        <View style={styles.rowActions}>
          <TouchableOpacity
            style={styles.btnAdd}
            onPress={() => navigation.navigate('OrderEntry', { symbol: item.stockSymbol, ltp: item.ltp, defaultSide: 'BUY' })}
          >
            <Text style={styles.btnAddTxt}>Add more</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnExit}
            onPress={() => navigation.navigate('OrderEntry', { symbol: item.stockSymbol, ltp: item.ltp, defaultSide: 'SELL', productType: item.productType })}
          >
            <Text style={styles.btnExitTxt}>Exit</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render: Day position row (today's F&O trades) ───────────────
  const renderDayPosition = ({ item }) => {
    const isGain   = item.pnl >= 0;
    const pType    = item.productType ?? 'NRML';
    const badge    = BADGE[pType] ?? BADGE.NRML;
    const exchange = getExchange(item.stockSymbol);
    const isClosed = item.isSquaredOff;

    return (
      <TouchableOpacity style={[styles.row, isClosed && styles.rowClosed]} activeOpacity={0.75}>
        {/* Line 1: Qty (blue) + Avg   |   badge */}
        <View style={styles.rowLine1}>
          <Text style={styles.rowMeta}>
            <Text style={styles.metaLabel}>Qty. </Text>
            <Text style={styles.metaQty}>{item.quantity}</Text>
            {'   '}
            <Text style={styles.metaLabel}>Avg. </Text>
            <Text style={styles.metaVal}>{fmt2(item.avgPrice)}</Text>
          </Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeTxt, { color: badge.text }]}>{pType}</Text>
          </View>
        </View>

        {/* Line 2: Symbol bold   |   P&L coloured */}
        <View style={styles.rowLine2}>
          <Text style={styles.rowSymbol} numberOfLines={1}>{item.stockSymbol}</Text>
          <Text style={[styles.rowPnl, { color: isGain ? colors.gain : colors.loss }]}>
            {isGain ? '+' : ''}{item.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        {/* Line 3: Exchange label   |   LTP */}
        <View style={styles.rowLine3}>
          <Text style={styles.rowExchange}>{exchange}</Text>
          <Text style={styles.rowLtp}>
            <Text style={styles.ltpLabel}>LTP </Text>
            {fmt2(item.ltp)}
          </Text>
        </View>

        {/* Realized vs unrealized breakdown for open positions */}
        {!isClosed && (item.unrealizedPnl != null) && (
          <View style={styles.pnlBreakdown}>
            <Text style={styles.breakdownTxt}>
              Realised <Text style={styles.breakdownVal}>{fmt2(item.realizedPnl ?? 0)}</Text>
            </Text>
            <Text style={styles.breakdownTxt}>
              Unrealised{' '}
              <Text style={[styles.breakdownVal, { color: (item.unrealizedPnl ?? 0) >= 0 ? colors.gain : colors.loss }]}>
                {(item.unrealizedPnl ?? 0) >= 0 ? '+' : ''}{fmt2(item.unrealizedPnl ?? 0)}
              </Text>
            </Text>
          </View>
        )}

        {/* Squared-off chip */}
        {item.isSquaredOff && (
          <View style={styles.squaredOffChip}>
            <Text style={styles.squaredOffTxt}>Squared off</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── Toolbar ──────────────────────────────────────────────────────
  const Toolbar = () => (
    <View style={styles.toolbar}>
      <View style={styles.toolLeft}>
        <TouchableOpacity style={styles.toolBtn}>
          <Ionicons name="search-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn}>
          <Ionicons name="options-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolRow}>
          <Ionicons name="list-outline" size={16} color={colors.primary} />
          <Text style={styles.toolRowTxt}> Group</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.toolRight}>
        <View style={styles.analyzeBtn}>
          <View style={styles.analyzeIcon}>
            <Ionicons name="analytics" size={13} color="#fff" />
          </View>
          <Text style={styles.analyzeTxt}>Analyze</Text>
        </View>
        <TouchableOpacity
          style={styles.analyticsToggle}
          onPress={() => setAnalyticsOn(p => !p)}
        >
          <View style={[styles.toggleDot, analyticsOn && styles.toggleDotOn]} />
          <Text style={[styles.toggleTxt, analyticsOn && { color: colors.primary }]}>Analytics</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────
  const isHoldings = tab === 0;
  const listData   = isHoldings ? holdings : dayPositions;
  const renderItem = isHoldings ? renderHolding : renderDayPosition;
  const posCount   = dayPositions.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Index ticker */}
      <IndexTicker
        indexes={indexes}
        onIndexPress={(name) => navigation.navigate('IndexChart', { indexName: name })}
      />

      {/* Order executed flash */}
      {flashMsg && (
        <Animated.View style={[styles.flash, { opacity: flashAnim }]}>
          <Ionicons name="checkmark-circle" size={13} color="#fff" />
          <Text style={styles.flashTxt}>{flashMsg}</Text>
        </Animated.View>
      )}

      {/* ── Tab bar — Holdings [N]  Positions [N] ── */}
      <View style={styles.tabBar}>
        {[['Holdings', holdings.length, false], ['Positions', posCount, true]].map(([label, count, isPos], i) => (
          <TouchableOpacity
            key={label}
            style={styles.tabItem}
            onPress={() => setTab(i)}
            activeOpacity={0.7}
          >
            <View style={styles.tabInner}>
              <Text style={[styles.tabTxt, tab === i && styles.tabTxtActive]}>{label}</Text>
              <View style={[styles.countBadge, tab === i && styles.countBadgeActive]}>
                <Text style={[styles.countTxt, tab === i && styles.countTxtActive]}>{count}</Text>
              </View>
            </View>
            {tab === i && <View style={styles.tabLine} />}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item, i) => item._id ?? item.stockSymbol ?? String(i)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            {/* ── Holdings: 3-col kite-pnl.png card ── */}
            {isHoldings ? (
              <View style={styles.hPnlCard}>
                {/* Col 1: Total investment */}
                <View style={styles.hCol}>
                  <View style={styles.hNumRow}>
                    <Text style={styles.hNum}>{splitNum(invested).w}</Text>
                    <Text style={styles.hDec}>.{splitNum(invested).d}</Text>
                  </View>
                  <Text style={styles.hLabel}>Total investment</Text>
                </View>
                <View style={styles.hDivider} />
                {/* Col 2: Current value */}
                <View style={styles.hCol}>
                  <View style={styles.hNumRow}>
                    <Text style={styles.hNum}>{splitNum(current).w}</Text>
                    <Text style={styles.hDec}>.{splitNum(current).d}</Text>
                  </View>
                  <Text style={styles.hLabel}>Current value</Text>
                </View>
                <View style={styles.hDivider} />
                {/* Col 3: P&L */}
                <View style={[styles.hCol, { alignItems: 'flex-end' }]}>
                  <View style={styles.hNumRow}>
                    <Text style={[styles.hNum, { color: hPnlGain ? colors.gain : colors.loss }]}>
                      {hPnlGain ? '+' : '-'}{splitNum(hPnl).w}
                    </Text>
                    <Text style={[styles.hDec, { color: hPnlGain ? colors.gain : colors.loss }]}>
                      .{splitNum(hPnl).d}
                    </Text>
                  </View>
                  <Text style={[styles.hLabel, { color: hPnlGain ? colors.gain : colors.loss }]}>
                    {hPnlGain ? '+' : ''}{hPnlPct.toFixed(2)}%
                  </Text>
                </View>
              </View>
            ) : (
              /* ── Positions: single "Total P&L" card ── */
              <View style={styles.posPnlCard}>
                <Text style={styles.posPnlLabel}>Total P&L</Text>
                <Text style={[styles.posPnlVal, { color: totalDayPnl >= 0 ? colors.gain : colors.loss }]}>
                  {totalDayPnl >= 0 ? '+' : ''}
                  {totalDayPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            )}

            <Toolbar />
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={44} color={colors.border} />
            <Text style={styles.emptyTitle}>
              {isHoldings ? 'No holdings' : 'No positions today'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {isHoldings ? 'Place an order from your watchlist' : 'All positions squared off'}
            </Text>
          </View>
        }
      />

      {/* Index FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('IndexChart', { indexName: 'NIFTY 50' })}>
        <Ionicons name="trending-up" size={18} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles (exact Kite values from screenshot) ─────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  flash: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.gain,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  flashTxt: { fontSize: 11, fontWeight: '400', color: '#fff' },

  // ── Tab bar ──
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    height: 46,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10 },
  tabTxt:  { fontSize: 14, fontWeight: '500', color: '#738390' },
  tabTxtActive: { color: '#1E1E1E', fontWeight: '700' },
  countBadge: {
    minWidth: 22, height: 18, borderRadius: 9,
    backgroundColor: '#1E1E1E',            // dark badge for inactive
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeActive: { backgroundColor: '#387ED1' },  // blue for active
  countTxt:        { fontSize: 10, fontWeight: '800', color: '#fff' },
  countTxtActive:  { color: '#fff' },
  tabLine: { height: 2, backgroundColor: '#387ED1', borderRadius: 1, width: '60%' },

  // ── Holdings 3-col card (kite-pnl.png) ──
  hPnlCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12, marginTop: 10, marginBottom: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#E8E8E8',
    paddingHorizontal: 12, paddingVertical: 14,
  },
  hCol:    { flex: 1 },
  hNumRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 3 },
  hNum:    { fontSize: 15, fontWeight: '400', color: '#1E1E1E' },
  hDec:    { fontSize: 11, fontWeight: '400', color: '#1E1E1E', marginBottom: 1 },
  hLabel:  { fontSize: 10, color: '#738390' },
  hDivider:{ width: 1, height: 38, backgroundColor: '#E8E8E8', marginHorizontal: 8 },

  // ── Positions single P&L card (exact from screenshot) ──
  posPnlCard: {
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 20,
    marginTop: 8,
    marginBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#E8E8E8',
  },
  posPnlLabel: { fontSize: 14, color: '#738390', marginBottom: 6 },
  posPnlVal:   { fontSize: 20, fontWeight: '400', color: '#1E1E1E' },

  // ── Toolbar ──
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E8E8E8',
    marginBottom: 1,
  },
  toolLeft:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  toolRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolBtn:   { padding: 6 },
  toolRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5 },
  toolRowTxt:{ fontSize: 13, color: '#387ED1', fontWeight: '500' },

  analyzeBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  analyzeIcon: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: '#E55B4D',
    alignItems: 'center', justifyContent: 'center',
  },
  analyzeTxt:  { fontSize: 13, color: '#1E1E1E', fontWeight: '500' },

  analyticsToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toggleDot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: '#387ED1', backgroundColor: '#fff',
  },
  toggleDotOn: { backgroundColor: '#387ED1' },
  toggleTxt: { fontSize: 13, color: '#738390', fontWeight: '500' },

  // ── Position / Holding row ──
  row: {
    backgroundColor: '#fff',
    paddingHorizontal: 16, paddingTop: 13, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  rowClosed: {
    backgroundColor: '#F5F5F5',
    opacity: 0.7,
  },

  rowLine1: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 5,
  },
  rowMeta:    { fontSize: 12, color: '#738390' },
  metaLabel:  { color: '#9CA3AF', fontWeight: '400' },
  metaQty:    { color: '#387ED1', fontWeight: '400' },
  metaVal:    { color: '#738390', fontWeight: '400' },

  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeTxt: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },

  rowLine2: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  rowSymbol: { fontSize: 14, fontWeight: '400', color: '#1E1E1E', flex: 1, marginRight: 8 },
  rowPnl:    { fontSize: 14, fontWeight: '400' },

  rowLine3: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  rowExchange: { fontSize: 11, color: '#9CA3AF' },
  rowLtp:      { fontSize: 12, color: '#1E1E1E' },
  ltpLabel:    { color: '#9CA3AF' },

  // Action buttons
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  btnAdd: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 4, borderWidth: 1, borderColor: '#387ED1',
  },
  btnAddTxt: { fontSize: 13, color: '#387ED1', fontWeight: '600' },
  btnExit: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 4, borderWidth: 1, borderColor: '#D1D5DB',
  },
  btnExitTxt: { fontSize: 13, color: '#1E1E1E', fontWeight: '600' },

  // Realized / unrealized breakdown (open day positions)
  pnlBreakdown: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 6,
  },
  breakdownTxt: { fontSize: 11, color: '#9CA3AF' },
  breakdownVal: { color: '#1E1E1E', fontWeight: '500' },

  // Squared-off chip (shown on day positions that are closed)
  squaredOffChip: {
    alignSelf: 'flex-end', marginTop: 6,
    backgroundColor: '#F3F4F6', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  squaredOffTxt: { fontSize: 11, color: '#6B7280', fontWeight: '500' },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle:    { fontSize: 15, fontWeight: '700', color: '#1E1E1E' },
  emptySubtitle: { fontSize: 13, color: '#738390' },

  // FAB
  fab: {
    position: 'absolute', right: 16, bottom: 90,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#E8E8E8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  fabTxt: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
