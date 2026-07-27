import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Animated, Alert, Modal, TextInput, ActivityIndicator,
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

// The server sends realised/unrealised/pnl already computed (from today's
// trade log + live mark-to-market) on /allPositions and positionsTick. A
// couple of transitional socket events (initialData, orderExecuted) still
// push raw position docs without those fields — this fills them in
// client-side so the row never shows "undefined" for the second before the
// next positionsTick self-heals it. (ltp - avgPrice) * quantity is
// sign-correct for shorts too: a short's quantity is negative, so a falling
// ltp (profit) naturally flips the product positive.
const withPositionPnl = (p) => {
  if (p.pnl != null && p.unrealizedPnl != null) return p; // already enriched by the server
  const unrealizedPnl = (p.ltp - p.avgPrice) * p.quantity;
  const realizedPnl = p.realizedPnl ?? 0;
  return { ...p, unrealizedPnl, realizedPnl, pnl: realizedPnl + unrealizedPnl };
};

export default function PortfolioScreen({ navigation }) {
  const [tab, setTab]               = useState(0);
  const [holdings, setHoldings]     = useState([]);
  const [positions, setPositions]   = useState([]);   // open equity MIS/NRML positions — live, real
  const [optionPositions, setOptPos] = useState([]);  // open F&O positions
  const [closedPositions, setClosedPositions] = useState([]);  // today's squared-off — frozen P&L
  const [refreshing, setRefreshing] = useState(false);
  const [indexes, setIndexes]       = useState({});
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [flashMsg, setFlashMsg]     = useState(null);
  // Day's Total P&L — realised P&L from EVERY symbol traded today (including
  // ones already squared off, whose docs are gone from positions/
  // optionPositions) + unrealised on whatever is still open. Comes from the
  // server (dayPnl REST call + positionsTick) since the client only ever
  // sees currently-open positions, not the full closed trade log.
  const [totalDayPnl, setTotalDayPnl] = useState(0);
  const insets = useSafeAreaInsets();

  // ── Holdings authorisation (CDSL TPIN flow) — visual-only simulation of
  // real Kite's actual holdings-authorisation step. 'info' -> 'sending' ->
  // 'otp' -> 'verifying' -> 'success', each transition on a short timer to
  // read as a real network round-trip rather than an instant fake toggle.
  const [authVisible, setAuthVisible] = useState(false);
  const [authStep, setAuthStep]       = useState('info');
  const [authOtp, setAuthOtp]         = useState('');

  const openAuth = () => { setAuthStep('info'); setAuthOtp(''); setAuthVisible(true); };
  const sendAuthOtp = () => {
    setAuthStep('sending');
    setTimeout(() => setAuthStep('otp'), 900);
  };
  const verifyAuthOtp = () => {
    if (authOtp.length !== 6) return;
    setAuthStep('verifying');
    setTimeout(() => setAuthStep('success'), 1100);
  };

  // ── Data fetch ──────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const [h, p, op, dayPnl, closed] = await Promise.all([
        api.getHoldings(),
        api.getPositions(),
        api.getOptionPositions(),
        api.getDayPnl().catch(() => null),
        api.getClosedPositions().catch(() => []),
      ]);
      setHoldings(h);
      setPositions(p.map(withPositionPnl));
      setOptPos(op || []);
      if (dayPnl) setTotalDayPnl(dayPnl.totalPnl);
      setClosedPositions(closed || []);
    } catch (e) { console.warn(e.message); }
    finally { setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  // ── Square off (long-press on a position) ────────────────────────
  const squareOffEquity = (pos) => {
    Alert.alert(
      'Square off position',
      `Close ${pos.quantity} × ${pos.stockSymbol} at market price?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Square off', style: 'destructive',
          onPress: async () => {
            try {
              await api.squareOffPosition(pos._id);
              fetchData();
            } catch (e) { Alert.alert('Failed', e.message); }
          },
        },
      ]
    );
  };

  const squareOffOption = (pos) => {
    Alert.alert(
      'Square off position',
      `Close ${pos.lots} lot${Math.abs(pos.lots) > 1 ? 's' : ''} of ${pos.symbol} at market premium?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Square off', style: 'destructive',
          onPress: async () => {
            try {
              await api.squareOffOptionPosition(pos._id);
              api.getOptionPositions().then(setOptPos).catch(() => {});
              api.getDayPnl().then(d => setTotalDayPnl(d.totalPnl)).catch(() => {});
              api.getClosedPositions().then(setClosedPositions).catch(() => {});
            } catch (e) { Alert.alert('Failed', e.message); }
          },
        },
      ]
    );
  };

  // ── Live socket updates ─────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    // initialData fires once on socket connect — populates all state
    // immediately without waiting for the first API call to complete.
    const onInitialData = (data) => {
      if (data.holdings)  setHoldings(data.holdings);
      if (data.positions) setPositions(data.positions.map(withPositionPnl));
    };
    socket.on('initialData', onInitialData);

    const onOrderExecuted = (data) => {
      if (data.positions) setPositions(data.positions.map(withPositionPnl));
      if (data.holdings) {
        // Use the server payload as-is. It's already live-priced from the same
        // tick store (holdingsWithLiveLtp), so ltp/change/changePercent are
        // mutually consistent. The old code overrode the fresh server ltp with
        // the stale client ltp while keeping the fresh change/changePercent —
        // that desynced the three: current value & overall P&L used the old
        // ltp, but Day's P&L used change relative to the *new* ltp, so the
        // numbers stopped reconciling (prevClose = ltp - change no longer held).
        setHoldings(data.holdings);
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
      // Every tick carries the full tracked-symbol price snapshot, but most
      // ticks don't move any of *this* user's holdings — the previous
      // version unconditionally allocated a new array (and every row's new
      // object) and called setState regardless, forcing the invested/
      // current reduce below (and every row's re-render) to redo work 1x/
      // sec even when nothing on screen actually changed. Returning the
      // *same* array reference when nothing changed lets React bail out of
      // the re-render entirely (Object.is check on setState).
      setHoldings(prev => {
        let changed = false;
        const next = prev.map(h => {
          const p = data.prices[h.stockSymbol];
          if (p && p.ltp != null && p.ltp !== h.ltp) {
            changed = true;
            // Keep ltp and change on the SAME price basis so overall P&L
            // (derived from ltp) and Day's P&L (derived from change) can never
            // drift apart. previous-close is fixed for the session, so derive
            // it once and recompute change from the new ltp against it —
            // rather than taking a new ltp but a stale `change`, which would
            // desync the two. When the tick carries a server change we trust
            // its prevClose; otherwise we reconstruct it from the last
            // consistent snapshot (h.ltp - h.change).
            const prevClose = (p.change != null)
              ? (p.ltp - p.change)
              : (h.ltp - (h.change ?? 0));
            const change = p.ltp - prevClose;
            const changePercent = prevClose ? (change / prevClose) * 100 : (h.changePercent ?? 0);
            return { ...h, ltp: p.ltp, change, changePercent };
          }
          return h;
        });
        return changed ? next : prev;
      });
    };
    const onOptionOrderExecuted = () => {
      api.getOptionPositions().then(setOptPos).catch(() => {});
    };
    // Server streams BOTH open equity positions and option positions,
    // re-priced from live cached ticks, every 1s during market hours — real
    // P&L movement with zero client polling, and no stale duplicate list.
    const onPositionsTick = (data) => {
      if (Array.isArray(data?.positions)) setPositions(data.positions.map(withPositionPnl));
      if (Array.isArray(data?.optionPositions)) setOptPos(data.optionPositions);
      // Squared-off rows keep their booked pnl frozen — only ltp moves here.
      if (Array.isArray(data?.closedPositions)) setClosedPositions(data.closedPositions);
      if (typeof data?.totalPnl === 'number') setTotalDayPnl(data.totalPnl);
    };
    // A dropped connection (backend restart, network blip, app backgrounded)
    // leaves `holdings`/`indexes` frozen at whatever the last tick was until
    // the next marketData broadcast arrives. Reconnecting via socket.io fires
    // 'connect' again (including on auto-reconnect, not just first mount), so
    // forcing a REST refetch there guarantees fresh DB+live-priced data right
    // away instead of silently waiting for the next tick.
    const onConnect = () => fetchData();
    socket.on('connect', onConnect);

    socket.on('orderExecuted', onOrderExecuted);
    socket.on('marketData', onMarketData);
    socket.on('optionOrderExecuted', onOptionOrderExecuted);
    socket.on('positionsTick', onPositionsTick);
    return () => {
      socket.off('connect', onConnect);
      socket.off('initialData', onInitialData);
      socket.off('orderExecuted', onOrderExecuted);
      socket.off('marketData', onMarketData);
      socket.off('optionOrderExecuted', onOptionOrderExecuted);
      socket.off('positionsTick', onPositionsTick);
    };
  }, []);

  // ── Holdings P&L summary (3-col kite-pnl style) ─────────────────
  // Memoized on `holdings` specifically — this screen is a permanently-
  // mounted tab root, so without this the reduce below re-ran on every
  // render including ones triggered by unrelated positions/indexes ticks.
  const { invested, current, hPnl, hPnlGain, hPnlPct, dayPnl, dayPnlGain, dayPnlPct } = useMemo(() => {
    const inv = holdings.reduce((s, h) => s + h.avgPrice * h.quantity, 0);
    const cur = holdings.reduce((s, h) => s + h.ltp * h.quantity, 0);
    const pnl = cur - inv;
    // Day's P&L — today's price move only (item.change, from the live feed),
    // not the holding's overall gain/loss since purchase. previous-close
    // value is derived as current - dayPnl rather than stored separately.
    const dPnl = holdings.reduce((s, h) => s + (h.change ?? 0) * h.quantity, 0);
    const prevCloseValue = cur - dPnl;
    return {
      invested: inv,
      current: cur,
      hPnl: pnl,
      hPnlGain: pnl >= 0,
      hPnlPct: inv > 0 ? (pnl / inv) * 100 : 0,
      dayPnl: dPnl,
      dayPnlGain: dPnl >= 0,
      dayPnlPct: prevCloseValue > 0 ? (dPnl / prevCloseValue) * 100 : 0,
    };
  }, [holdings]);


  // ── Render: Holdings row (matches real Kite's Holdings-tab row exactly:
  // Qty/Avg + overall P&L%   |   Symbol + P&L   |   Invested + LTP(day%)) ──
  const renderHolding = ({ item }) => {
    const invested = item.avgPrice * item.quantity;
    const pnl      = (item.ltp - item.avgPrice) * item.quantity;
    const isGain   = pnl >= 0;
    const pnlPct   = invested > 0 ? (pnl / invested) * 100 : 0;
    const dayPct   = item.changePercent ?? 0;
    const dayGain  = dayPct >= 0;

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('StockDetail', { symbol: item.stockSymbol, ltp: item.ltp })}
        activeOpacity={0.75}
      >
        <View style={styles.rowLine1}>
          <Text style={styles.rowMeta}>
            <Text style={styles.metaLabel}>Qty. </Text>
            <Text style={styles.metaVal}>{item.quantity}</Text>
            <Text style={styles.metaLabel}>  •  Avg. </Text>
            <Text style={styles.metaVal}>{fmt2(item.avgPrice)}</Text>
          </Text>
          <Text style={[styles.rowPctSmall, { color: isGain ? colors.gain : colors.loss }]}>
            {isGain ? '+' : ''}{pnlPct.toFixed(2)}%
          </Text>
        </View>

        <View style={styles.rowLine2}>
          <Text style={styles.rowSymbol} numberOfLines={1}>{item.stockSymbol}</Text>
          <Text style={[styles.rowPnl, { color: isGain ? colors.gain : colors.loss }]}>
            {isGain ? '+' : '-'}{fmtINR(pnl)}
          </Text>
        </View>

        <View style={styles.rowLine3}>
          <Text style={styles.rowExchange}>
            <Text style={styles.ltpLabel}>Invested </Text>
            {fmt2(invested)}
          </Text>
          <Text style={styles.rowLtp}>
            <Text style={styles.ltpLabel}>LTP </Text>
            {fmt2(item.ltp)}{' '}
            <Text style={{ color: dayGain ? colors.gain : colors.loss }}>
              ({dayGain ? '+' : ''}{dayPct.toFixed(2)}%)
            </Text>
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render: open equity position row (live PositionsModel, MIS/NRML) ────
  // Long-press → square off at market. Data comes straight from the live
  // position collection (via positionsTick), not a static day-trade recap.
  const renderPosition = ({ item }) => {
    const isGain   = item.pnl >= 0;
    const pType    = item.productType ?? 'MIS';
    const badge    = BADGE[pType] ?? BADGE.NRML;
    const exchange = getExchange(item.stockSymbol);
    const isShort  = item.quantity < 0;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onLongPress={() => squareOffEquity(item)}
        delayLongPress={350}
      >
        {/* Line 1: Qty (blue) + Avg   |   badge */}
        <View style={styles.rowLine1}>
          <Text style={styles.rowMeta}>
            <Text style={styles.metaLabel}>Qty. </Text>
            <Text style={styles.metaQty}>{item.quantity}</Text>
            {isShort && <Text style={styles.shortTag}> SHORT</Text>}
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

        <Text style={styles.longPressHint}>Hold to square off</Text>
      </TouchableOpacity>
    );
  };

  // ── Render: open F&O position row (merged into the same Positions list) ──
  const renderOptionPosition = ({ item: pos }) => {
    const pnl     = pos.pnl ?? 0;
    const isGain  = pnl >= 0;
    const isShort = pos.quantity < 0;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onLongPress={() => squareOffOption(pos)}
        delayLongPress={350}
      >
        <View style={styles.rowLine1}>
          <Text style={styles.rowMeta}>
            <Text style={styles.metaLabel}>Lots. </Text>
            <Text style={styles.metaQty}>{pos.lots}</Text>
            {isShort && <Text style={styles.shortTag}> SHORT</Text>}
            {'   '}
            <Text style={styles.metaLabel}>Avg. </Text>
            <Text style={styles.metaVal}>{fmt2(pos.avgPremium)}</Text>
          </Text>
          <View style={[styles.badge, { backgroundColor: BADGE.NRML.bg }]}>
            <Text style={[styles.badgeTxt, { color: BADGE.NRML.text }]}>F&O</Text>
          </View>
        </View>

        <View style={styles.rowLine2}>
          <Text style={styles.rowSymbol} numberOfLines={1}>{pos.symbol}</Text>
          <Text style={[styles.rowPnl, { color: isGain ? colors.gain : colors.loss }]}>
            {isGain ? '+' : ''}{pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        <View style={styles.rowLine3}>
          <Text style={styles.rowExchange}>{getExchange(pos.symbol)}</Text>
          <Text style={styles.rowLtp}>
            <Text style={styles.ltpLabel}>LTP </Text>
            {fmt2(pos.ltp)}
          </Text>
        </View>

        <Text style={styles.longPressHint}>Hold to square off</Text>
      </TouchableOpacity>
    );
  };

  // ── Render: squared-off position — frozen booked P&L, grey/shadow styling.
  // No long-press (nothing left to close); LTP still shown live for
  // reference but never feeds back into the pnl figure, which is exactly
  // what was booked at the moment it closed.
  const renderClosedPosition = ({ item: c }) => {
    const isGain = c.pnl >= 0;
    const isOption = c.kind === 'option';
    return (
      <View style={[styles.row, styles.closedRow]}>
        <View style={styles.rowLine1}>
          <Text style={styles.rowMeta}>
            <Text style={styles.metaLabel}>{isOption ? 'Lots. ' : 'Qty. '}</Text>
            <Text style={styles.metaQtyClosed}>{isOption ? c.lots : c.quantity}</Text>
            {'   '}
            <Text style={styles.metaLabel}>Avg. </Text>
            <Text style={styles.metaVal}>{fmt2(c.avgPrice)}</Text>
          </Text>
          <View style={styles.closedBadge}>
            <Text style={styles.closedBadgeTxt}>SQUARED OFF</Text>
          </View>
        </View>

        <View style={styles.rowLine2}>
          <Text style={[styles.rowSymbol, styles.closedTxt]} numberOfLines={1}>{c.symbol}</Text>
          <Text style={[styles.rowPnl, { color: isGain ? colors.gain : colors.loss }]}>
            {isGain ? '+' : ''}{c.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        <View style={styles.rowLine3}>
          <Text style={styles.rowExchange}>{getExchange(c.symbol)}</Text>
          <Text style={styles.rowLtp}>
            <Text style={styles.ltpLabel}>LTP </Text>
            {fmt2(c.ltp)}
          </Text>
        </View>

        <Text style={styles.closedHint}>Booked · exited at {fmt2(c.exitPrice)}</Text>
      </View>
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

  // ── Holdings toolbar (matches real Kite's Holdings-tab toolbar exactly:
  // search, filter, lock  |  Equity segment  |  Family  |  Analytics) ──
  const HoldingsToolbar = () => (
    <View style={styles.toolbar}>
      <View style={styles.toolLeft}>
        <TouchableOpacity style={styles.toolBtn}>
          <Ionicons name="search-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn}>
          <Ionicons name="options-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.segmentPill}>
          <Text style={styles.segmentPillTxt}>Equity</Text>
          <Ionicons name="chevron-down" size={12} color="#1E1E1E" />
        </TouchableOpacity>
      </View>
      <View style={styles.toolRight}>
        <TouchableOpacity style={styles.familyBtn}>
          <Ionicons name="people-outline" size={16} color={colors.primary} />
          <Text style={styles.familyTxt}>Family</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.analyticsCircle}>
          <Ionicons name="analytics" size={13} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────
  const isHoldings = tab === 0;
  // Positions tab merges live equity + F&O positions AND today's squared-off
  // positions into one scrollable list (tagged by _kind). Active positions
  // stay on top and keep moving live; closed rows sit below, visually set
  // apart by their own grey/shadow row styling (no separate section label).
  const listData = isHoldings
    ? holdings
    : [
        ...positions.map(p => ({ ...p, _kind: 'equity' })),
        ...optionPositions.map(p => ({ ...p, _kind: 'option' })),
        ...closedPositions.map(c => ({ ...c, _kind: 'closed' })),
      ];
  const renderItem = isHoldings
    ? renderHolding
    : ({ item }) => {
        if (item._kind === 'closed') return renderClosedPosition({ item });
        return item._kind === 'option' ? renderOptionPosition({ item }) : renderPosition({ item });
      };
  const posCount = positions.length + optionPositions.length;

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
        style={{ flex: 1 }}
        data={listData}
        keyExtractor={(item, i) => item._id ?? item.stockSymbol ?? String(i)}
        renderItem={renderItem}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            {/* ── Holdings: Invested/Current row + P&L row (matches real Kite) ── */}
            {isHoldings ? (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View>
                    <Text style={styles.summaryLabel}>Invested</Text>
                    <Text style={styles.summaryValue}>{fmt2(invested)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.summaryLabel}>Current</Text>
                    <Text style={styles.summaryValue}>{fmt2(current)}</Text>
                  </View>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>P&L</Text>
                  <View style={styles.summaryPnlRow}>
                    <Text style={[styles.summaryPnlValue, { color: hPnlGain ? colors.gain : colors.loss }]}>
                      {hPnlGain ? '+' : '-'}{fmtINR(hPnl)}
                    </Text>
                    <View style={[styles.pctPill, { backgroundColor: hPnlGain ? '#E6F7EF' : '#FCEAE8' }]}>
                      <Text style={[styles.pctPillTxt, { color: hPnlGain ? colors.gain : colors.loss }]}>
                        {hPnlGain ? '+' : ''}{hPnlPct.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
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

            {isHoldings ? <HoldingsToolbar /> : <Toolbar />}
          </>
        }
        ListFooterComponent={
          isHoldings && holdings.length > 0 ? (
            <TouchableOpacity
              style={styles.authRow}
              onPress={openAuth}
            >
              <Ionicons name="lock-closed-outline" size={14} color={colors.primary} />
              <Text style={styles.authTxt}>Authorisation</Text>
            </TouchableOpacity>
          ) : null
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

      {/* Day's P&L footer bar — Holdings tab only, matches real Kite */}
      {isHoldings && holdings.length > 0 && (
        <View style={styles.dayPnlBar}>
          <Text style={styles.dayPnlLabel}>Day's P&L</Text>
          <Text style={[styles.dayPnlValue, { color: dayPnlGain ? colors.gain : colors.loss }]}>
            {dayPnlGain ? '+' : ''}{fmtINR(dayPnl)}{'  '}
            {dayPnlGain ? '+' : ''}{dayPnlPct.toFixed(2)}%
          </Text>
        </View>
      )}

      {/* Index FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('IndexChart', { indexName: 'NIFTY 50' })}>
        <Ionicons name="trending-up" size={18} color={colors.primary} />
      </TouchableOpacity>

      {/* Holdings authorisation — CDSL TPIN flow (visual simulation) */}
      <Modal visible={authVisible} transparent animationType="slide" onRequestClose={() => setAuthVisible(false)}>
        <View style={styles.authOverlayWrap}>
          <TouchableOpacity style={styles.authOverlay} activeOpacity={1} onPress={() => setAuthVisible(false)} />
          <View style={[styles.authSheet, { paddingBottom: (insets.bottom || 12) + 16 }]}>
            <View style={styles.authHandle} />

            {authStep === 'info' && (
              <>
                <View style={styles.authCdslBadge}>
                  <Ionicons name="shield-checkmark" size={16} color="#387ED1" />
                  <Text style={styles.authCdslBadgeTxt}>CDSL</Text>
                </View>
                <Text style={styles.authTitle}>Authorise holdings</Text>
                <Text style={styles.authBody}>
                  SEBI requires a one-time authorisation before holdings can be sold from your demat
                  account. We'll send a 6-digit OTP to your registered mobile number linked with CDSL.
                </Text>
                <View style={styles.authInfoRow}>
                  <Ionicons name="briefcase-outline" size={14} color="#738390" />
                  <Text style={styles.authInfoTxt}>{holdings.length} holding{holdings.length === 1 ? '' : 's'} pending authorisation</Text>
                </View>
                <TouchableOpacity style={styles.authPrimaryBtn} onPress={sendAuthOtp} activeOpacity={0.85}>
                  <Text style={styles.authPrimaryBtnTxt}>Send OTP</Text>
                </TouchableOpacity>
              </>
            )}

            {authStep === 'sending' && (
              <View style={styles.authCenter}>
                <ActivityIndicator color="#387ED1" size="large" />
                <Text style={styles.authWaitTxt}>Requesting OTP from CDSL…</Text>
              </View>
            )}

            {authStep === 'otp' && (
              <>
                <Text style={styles.authTitle}>Enter OTP</Text>
                <Text style={styles.authBody}>OTP sent to your registered mobile number ending •••210</Text>
                <TextInput
                  style={styles.authOtpInput}
                  value={authOtp}
                  onChangeText={(t) => setAuthOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="••••••"
                  placeholderTextColor="#B3BBBF"
                  autoFocus
                />
                <TouchableOpacity onPress={sendAuthOtp}>
                  <Text style={styles.authResendTxt}>Resend OTP</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.authPrimaryBtn, authOtp.length !== 6 && styles.authPrimaryBtnDisabled]}
                  onPress={verifyAuthOtp}
                  disabled={authOtp.length !== 6}
                  activeOpacity={0.85}
                >
                  <Text style={styles.authPrimaryBtnTxt}>Verify & Authorise</Text>
                </TouchableOpacity>
              </>
            )}

            {authStep === 'verifying' && (
              <View style={styles.authCenter}>
                <ActivityIndicator color="#387ED1" size="large" />
                <Text style={styles.authWaitTxt}>Verifying with CDSL…</Text>
              </View>
            )}

            {authStep === 'success' && (
              <View style={styles.authCenter}>
                <View style={styles.authSuccessIcon}>
                  <Ionicons name="checkmark" size={28} color="#fff" />
                </View>
                <Text style={styles.authTitle}>Holdings authorised</Text>
                <Text style={styles.authBody}>
                  Your holdings are authorised for selling. This stays valid for today's trading session.
                </Text>
                <TouchableOpacity style={styles.authPrimaryBtn} onPress={() => setAuthVisible(false)} activeOpacity={0.85}>
                  <Text style={styles.authPrimaryBtnTxt}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
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

  // ── Holdings summary card — Invested/Current row, divider, P&L row
  // (matches real Kite's Holdings-tab layout exactly) ──
  summaryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12, marginTop: 10, marginBottom: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#E8E8E8',
    paddingHorizontal: 14, paddingVertical: 14,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryLabel: { fontSize: 12, color: '#738390', marginBottom: 4 },
  summaryValue: { fontSize: 17, fontWeight: '600', color: '#1E1E1E' },
  summaryDivider: { height: 1, backgroundColor: '#E8E8E8', marginVertical: 12 },
  summaryPnlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryPnlValue: { fontSize: 17, fontWeight: '600' },
  pctPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pctPillTxt: { fontSize: 12, fontWeight: '700' },

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

  // ── Holdings toolbar extras (Equity segment / Family / Analytics) ──
  segmentPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F1F3F4', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5, marginLeft: 4,
  },
  segmentPillTxt: { fontSize: 12, fontWeight: '600', color: '#1E1E1E' },
  familyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  familyTxt: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  analyticsCircle: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#387ED1',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Authorisation link (Holdings tab footer) ──
  authRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  authTxt: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  // ── Day's P&L bar (Holdings tab, pinned above the bottom tab nav) ──
  dayPnlBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#E8E8E8',
  },
  dayPnlLabel: { fontSize: 13, color: '#738390' },
  dayPnlValue: { fontSize: 13, fontWeight: '600' },

  // ── Position / Holding row ──
  row: {
    backgroundColor: '#fff',
    paddingHorizontal: 16, paddingTop: 13, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  shortTag: { color: colors.loss, fontWeight: '700', fontSize: 11 },

  // ── Squared-off (closed) position row — frozen P&L, grey/shadow look ──
  closedRow: {
    backgroundColor: '#FAFAFA',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 2, elevation: 0,
  },
  closedTxt: { color: '#9CA3AF' },
  metaQtyClosed: { color: '#9CA3AF', fontWeight: '400' },
  closedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: '#EEEEEE' },
  closedBadgeTxt: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3, color: '#9CA3AF' },
  closedHint: { fontSize: 10, color: '#B3BBBF', marginTop: 6, textAlign: 'center' },
  longPressHint: { fontSize: 10, color: '#B3BBBF', marginTop: 6, textAlign: 'center' },

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
  rowPctSmall: { fontSize: 12, fontWeight: '500' },

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

  // ── Holdings authorisation sheet (CDSL TPIN flow) ──
  authOverlayWrap: { flex: 1, justifyContent: 'flex-end' },
  authOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  authSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 10, paddingHorizontal: 20,
  },
  authHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginBottom: 16,
  },
  authCdslBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#EAF2FC', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, marginBottom: 12,
  },
  authCdslBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#387ED1', letterSpacing: 0.5 },
  authTitle: { fontSize: 18, fontWeight: '700', color: '#1E1E1E', marginBottom: 8, textAlign: 'left' },
  authBody: { fontSize: 13, color: '#738390', lineHeight: 19, marginBottom: 14 },
  authInfoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F8F9FA', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 18,
  },
  authInfoTxt: { fontSize: 12, color: '#738390' },
  authPrimaryBtn: {
    backgroundColor: '#387ED1', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center', marginBottom: 4,
  },
  authPrimaryBtnDisabled: { backgroundColor: '#B8D3F0' },
  authPrimaryBtnTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  authOtpInput: {
    borderWidth: 1.5, borderColor: '#E8E8E8', borderRadius: 8,
    fontSize: 22, fontWeight: '700', letterSpacing: 12, color: '#1E1E1E',
    textAlign: 'center', paddingVertical: 14, marginBottom: 12,
  },
  authResendTxt: { fontSize: 13, color: '#387ED1', fontWeight: '600', marginBottom: 18, textAlign: 'center' },
  authCenter: { alignItems: 'center', paddingVertical: 20 },
  authWaitTxt: { fontSize: 13, color: '#738390', marginTop: 14 },
  authSuccessIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.gain,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
});
