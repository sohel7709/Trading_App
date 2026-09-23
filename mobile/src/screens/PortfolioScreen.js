/**
 * PortfolioScreen.js (Production Upgraded)
 * ─────────────────────────────────────────────────────────
 * Institutional Portfolio Screen with:
 * - Segmented tabs: Open Positions vs Closed Trades
 * - Real-time PnL updates via socket.io (pnl_update, positionTick)
 * - Green/Red flash & % change indicators
 * - One-tap Square-off confirmation modal
 * - Closed trade ledger with entry/exit prices & booked PnL
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  RefreshControl, StatusBar, Modal, Pressable, Platform,
  ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import useSocket from '../hooks/useSocket';
import { SOCKET_EVENTS } from '../socket/socketEvents';
import SkeletonLoader from '../components/SkeletonLoader';
import OrderBottomSheet from '../components/order/OrderBottomSheet';
import { useAuth } from '../context/AuthContext';
import IndexTicker from '../components/IndexTicker';

const { width } = Dimensions.get('window');

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => {
  const num = Math.abs(Number(n) || 0);
  try {
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return '₹' + num.toFixed(2);
  }
};
const fmtPL = (n) => {
  const num = Number(n) || 0;
  return (num >= 0 ? '+' : '-') + fmt(num);
};
const pnlColor = (n) => (Number(n) >= 0 ? colors.gain : colors.loss);
const pnlBg = (n) => (Number(n) >= 0 ? colors.gainLight : colors.lossLight);

export const formatExactTimestamp = (dateStr) => {
  if (!dateStr) return '--:--:--';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--:--:--';
    const timeStr = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const datePart = d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return `${timeStr} · ${datePart}`;
  } catch {
    return '--:--:--';
  }
};

// ── Square-off confirm modal ──────────────────────────────────────────────────
function SquareOffModal({ position, loading, onConfirm, onClose }) {
  if (!position) return null;
  const isBuy = String(position.side || 'BUY').toUpperCase() === 'BUY';
  const pnl = position.pnl !== undefined
    ? Number(position.pnl) || 0
    : (Number(position.ltp || 0) - Number(position.avgPrice || 0)) * Number(position.quantity || 0) * (isBuy ? 1 : -1);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={sqStyles.backdrop} onPress={onClose} />
      <View style={sqStyles.card}>
        <View style={[sqStyles.iconWrap, { backgroundColor: pnlBg(pnl) }]}>
          <Ionicons name="exit-outline" size={32} color={pnl >= 0 ? colors.gain : colors.loss} />
        </View>
        <Text style={sqStyles.title}>Square Off Position?</Text>
        <Text style={sqStyles.symbol}>{position.symbol}</Text>

        <View style={sqStyles.statsRow}>
          <View style={sqStyles.stat}>
            <Text style={sqStyles.statLabel}>Qty</Text>
            <Text style={sqStyles.statVal}>{position.quantity}</Text>
          </View>
          <View style={sqStyles.stat}>
            <Text style={sqStyles.statLabel}>Avg Price</Text>
            <Text style={sqStyles.statVal}>{fmt(position.avgPrice || position.avgPremium)}</Text>
          </View>
          <View style={sqStyles.stat}>
            <Text style={sqStyles.statLabel}>LTP</Text>
            <Text style={sqStyles.statVal}>{fmt(position.ltp)}</Text>
          </View>
        </View>

        <View style={[sqStyles.pnlRow, { backgroundColor: pnlBg(pnl) }]}>
          <Text style={sqStyles.pnlLabel}>Estimated Realized P&L</Text>
          <Text style={[sqStyles.pnlVal, { color: pnlColor(pnl) }]}>{fmtPL(pnl)}</Text>
        </View>

        <View style={sqStyles.actions}>
          <TouchableOpacity style={sqStyles.cancelBtn} onPress={onClose}>
            <Text style={sqStyles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[sqStyles.confirmBtn, loading && { opacity: 0.6 }]}
            onPress={onConfirm}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={sqStyles.confirmBtnText}>Confirm Exit</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Open Position Card ────────────────────────────────────────────────────────
const PositionCard = React.memo(function PositionCard({ position, onTradeAction, onSquareOff }) {
  if (!position) return null;
  const avg = Number(position.avgPrice || position.avgPremium || 0);
  const curLtp = Number(position.ltp || avg || 0);
  const qty = Number(position.quantity || 0);
  const isBuy = String(position.side || 'BUY').toUpperCase() === 'BUY';
  const dir = isBuy ? 1 : -1;

  const pnl = position.pnl !== undefined
    ? Number(position.pnl) || 0
    : (curLtp - avg) * qty * dir;

  const pnlPct = avg > 0
    ? ((curLtp - avg) / avg) * 100 * dir
    : 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onTradeAction?.(position)}
      onLongPress={() => onSquareOff?.(position)}
      delayLongPress={300}
      activeOpacity={0.88}
    >
      <View style={styles.cardTop}>
        <View style={styles.symbolGroup}>
          <View style={[styles.typeBadge, { backgroundColor: isBuy ? '#eff6ff' : '#fef2f2' }]}>
            <Text style={[styles.typeText, { color: isBuy ? colors.buyAction : colors.sellAction }]}>
              {position.side || 'BUY'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.symbol} numberOfLines={1}>{position.symbol}</Text>
            <Text style={styles.expiry}>{position.productType || 'NRML'} • {position.expiry || 'Simulated'}</Text>
          </View>
        </View>

        <View style={styles.pnlGroup}>
          <Text style={[styles.pnlVal, { color: pnlColor(pnl) }]}>{fmtPL(pnl)}</Text>
          <View style={[styles.pctBadge, { backgroundColor: pnlBg(pnl) }]}>
            <Ionicons name={pnl >= 0 ? 'arrow-up' : 'arrow-down'} size={10} color={pnlColor(pnl)} />
            <Text style={[styles.pnlPct, { color: pnlColor(pnl) }]}>
              {Math.abs(Number(pnlPct) || 0).toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Qty</Text>
          <Text style={styles.statVal}>{qty}</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Avg Entry</Text>
          <Text style={styles.statVal}>{fmt(avg)}</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>LTP</Text>
          <Text style={styles.statVal}>{fmt(curLtp)}</Text>
        </View>
        <View style={[styles.statCol, { alignItems: 'flex-end' }]}>
          <TouchableOpacity
            style={styles.inlineSqBtn}
            onPress={() => onSquareOff?.(position)}
          >
            <Text style={styles.inlineSqText}>Square off</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardActionHint}>
        <Text style={styles.cardActionHintText}>
          Tap to Buy/Sell • Long-press to Square-off
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ── Closed Trade Card ─────────────────────────────────────────────────────────
function ClosedTradeCard({ trade }) {
  if (!trade) return null;
  const pnl = Number(trade.pnl || 0);
  const entry = Number(trade.avgPrice || trade.buyPrice || trade.entryPrice || 0);
  const exit = Number(trade.exitPrice || trade.closePrice || 0);
  const qty = Number(trade.quantity || trade.lots || 0);
  let dateStr = trade.dateStr || 'Today';
  if (trade.closedAt) {
    try {
      const d = new Date(trade.closedAt);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      }
    } catch {
      dateStr = trade.dateStr || 'Today';
    }
  }

  return (
    <View style={styles.closedCard}>
      <View style={styles.cardTop}>
        <View style={styles.symbolGroup}>
          <View style={[styles.typeBadge, { backgroundColor: '#f1f5f9' }]}>
            <Text style={[styles.typeText, { color: '#64748b' }]}>CLOSED</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.symbol} numberOfLines={1}>{trade.symbol || trade.stockSymbol || 'Trade'}</Text>
            <Text style={styles.expiry}>{trade.productType || 'MIS'} • {dateStr}</Text>
          </View>
        </View>

        <View style={styles.pnlGroup}>
          <Text style={[styles.pnlVal, { color: pnlColor(pnl) }]}>{fmtPL(pnl)}</Text>
          <View style={[styles.pctBadge, { backgroundColor: pnlBg(pnl) }]}>
            <Text style={[styles.pnlPct, { color: pnlColor(pnl) }]}>
              {pnl >= 0 ? 'PROFIT' : 'LOSS'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Units</Text>
          <Text style={styles.statVal}>{qty}</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Entry</Text>
          <Text style={styles.statVal}>{entry > 0 ? fmt(entry) : '--'}</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Exit</Text>
          <Text style={styles.statVal}>{exit > 0 ? fmt(exit) : '--'}</Text>
        </View>
        <View style={[styles.statCol, { alignItems: 'flex-end' }]}>
          <Text style={styles.statLabel}>Status</Text>
          <Text style={[styles.statVal, { color: '#059669', fontWeight: '700' }]}>Settled</Text>
        </View>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PortfolioScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('OPEN'); // 'OPEN' | 'CLOSED'
  const [positions, setPositions] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [closedTrades, setClosedTrades] = useState([]);
  const [portfolioMeta, setPortfolioMeta] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [squareOffTarget, setSquareOffTarget] = useState(null);
  const [squareOffLoading, setSquareOffLoading] = useState(false);

  // Order panel for tapping open position (Buy More / Sell)
  const [orderSheetVisible, setOrderSheetVisible] = useState(false);
  const [sheetInstrument, setSheetInstrument] = useState(null);
  const [sheetSide, setSheetSide] = useState('BUY');

  const handlePositionPress = useCallback((pos) => {
    if (!pos) return;
    let underlyingSymbol = pos.underlyingSymbol || pos.symbol || pos.stockSymbol;
    let strikePrice = pos.strikePrice != null ? Number(pos.strikePrice) : null;
    let optionType = pos.optionType || null;
    let expiry = pos.expiry || 'NEAR';
    let lotSize = pos.lotSize || (strikePrice ? 50 : 1);

    if (!strikePrice && pos.symbol) {
      const match = String(pos.symbol).match(/^([A-Z\s]+)\s+(\d+)\s+(CE|PE)$/i);
      if (match) {
        underlyingSymbol = match[1].trim();
        strikePrice = Number(match[2]);
        optionType = match[3].toUpperCase();
      }
    }

    const curLtp = Number(pos.ltp || pos.avgPrice || pos.avgPremium || 0);
    const posQty = Math.abs(Number(pos.quantity || pos.qty || 1));
    const existingLots = Math.max(1, Math.round(posQty / (pos.lotSize || 50)));

    setSheetInstrument({
      underlyingSymbol,
      strikePrice,
      optionType,
      expiry,
      ltp: curLtp,
      lotSize: strikePrice ? (pos.lotSize || 50) : 1,
      openLots: existingLots,
    });
    setSheetSide(String(pos.side || 'BUY').toUpperCase());
    setOrderSheetVisible(true);
  }, []);

  // ── Cache-first instant display ───────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem('cache:portfolio')
      .then((raw) => {
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached) {
            setPortfolioMeta(cached);
            if (Array.isArray(cached.positions)) setPositions(cached.positions);
            if (Array.isArray(cached.closedTrades)) setClosedTrades(cached.closedTrades);
            setLoading(false);
          }
        }
      })
      .catch(() => {});
  }, []);

  // ── Unified Fetch ──────────────────────────────────────────────────────────
  const fetchPortfolioData = useCallback(async () => {
    try {
      const [data, ordersRes] = await Promise.all([
        api.getPortfolio().catch((e) => { console.warn('[Portfolio] getPortfolio failed:', e.message); return null; }),
        api.getOrders().catch((e) => { console.warn('[Portfolio] getOrders failed:', e.message); return []; }),
      ]);
      if (data) {
        setPortfolioMeta(data);
        if (Array.isArray(data.positions)) setPositions(data.positions);
        if (Array.isArray(data.closedTrades)) setClosedTrades(data.closedTrades);
        AsyncStorage.setItem('cache:portfolio', JSON.stringify(data)).catch(() => {});
        const ords = Array.isArray(ordersRes) && ordersRes.length > 0
          ? ordersRes
          : (Array.isArray(data.orders) ? data.orders : []);
        setOpenOrders(ords.filter(o => {
          const s = String(o?.status || '').toUpperCase();
          return s === 'PENDING' || s === 'TRIGGER_PENDING';
        }));
      } else {
        const [opts, ords] = await Promise.all([
          api.getOptionPositions().catch((e) => { console.warn('[Portfolio] getOptionPositions failed:', e.message); return []; }),
          api.getOrders().catch((e) => { console.warn('[Portfolio] getOrders2 failed:', e.message); return []; })
        ]);
        if (Array.isArray(opts)) setPositions(opts);
        if (Array.isArray(ords)) {
          setOpenOrders(ords.filter(o => {
            const s = String(o?.status || '').toUpperCase();
            return s === 'PENDING' || s === 'TRIGGER_PENDING';
          }));
        }
      }
    } catch (e) {
      console.warn('[Portfolio] Fetch error:', e.message);
      try {
        const [opts, ords] = await Promise.all([
          api.getOptionPositions().catch(() => []),
          api.getOrders().catch(() => [])
        ]);
        if (Array.isArray(opts)) setPositions(opts);
        if (Array.isArray(ords)) {
          setOpenOrders(ords.filter(o => {
            const s = String(o?.status || '').toUpperCase();
            return s === 'PENDING' || s === 'TRIGGER_PENDING';
          }));
        }
      } catch (err) {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPortfolioData();
    }, [fetchPortfolioData])
  );

  // ── Real-Time Sockets (300ms Throttled Buffer System) ───────────────────────
  const tickBufferRef = useRef(null);
  const pnlBufferRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      if (tickBufferRef.current) {
        const data = tickBufferRef.current;
        tickBufferRef.current = null;
        if (Array.isArray(data.positions)) {
          setPositions(data.positions);
        } else {
          const eq = Array.isArray(data.equityPositions) ? data.equityPositions : [];
          const opt = Array.isArray(data.optionPositions) ? data.optionPositions : [];
          const hld = Array.isArray(data.holdings) ? data.holdings : [];
          if (eq.length || opt.length || hld.length) {
            setPositions([...eq, ...opt, ...hld]);
          }
        }
        if (data.totalPnl !== undefined || data.totalRealizedPnl !== undefined) {
          setPortfolioMeta(prev => ({
            ...prev,
            totalPnl: data.totalPnl ?? prev?.totalPnl,
            realizedPnl: data.totalRealizedPnl ?? prev?.realizedPnl,
            ...(data.wallet ? {
              balance: data.wallet.balance ?? prev?.balance,
              usedMargin: (data.wallet.totalUsedMargin ?? data.wallet.usedMargin) ?? prev?.usedMargin,
              availableMargin: data.wallet.availableMargin ?? prev?.availableMargin,
              blockedMargin: data.wallet.blockedMargin ?? prev?.blockedMargin,
            } : {})
          }));
        } else if (data.wallet) {
          setPortfolioMeta(prev => ({
            ...prev,
            balance: data.wallet.balance ?? prev?.balance,
            usedMargin: (data.wallet.totalUsedMargin ?? data.wallet.usedMargin) ?? prev?.usedMargin,
            availableMargin: data.wallet.availableMargin ?? prev?.availableMargin,
            blockedMargin: data.wallet.blockedMargin ?? prev?.blockedMargin,
          }));
        }
      }

      if (pnlBufferRef.current) {
        const pnlData = pnlBufferRef.current;
        pnlBufferRef.current = null;
        setPortfolioMeta(prev => ({
          ...prev,
          ...pnlData,
        }));
      }
    }, 300);

    return () => clearInterval(timer);
  }, []);

  useSocket('pnl_update', (data) => {
    if (!data) return;
    const currentUid = (user?._id || user?.id)?.toString();
    const targetUid = (data.studentId || data.userId)?.toString();
    if (targetUid && currentUid && targetUid !== currentUid) return; // Ignore updates for other students
    if (data?.todayPnl !== undefined || data?.totalPnl !== undefined) {
      pnlBufferRef.current = data;
    }
  });

  const handlePositionTick = useCallback((data) => {
    if (!data) return;
    tickBufferRef.current = data;
  }, []);

  useSocket('positionsTick', handlePositionTick);
  useSocket(SOCKET_EVENTS.POSITION_TICK, handlePositionTick);

  useSocket('orderExecuted', () => {
    fetchPortfolioData();
  });

  useSocket('orderCancelled', () => {
    fetchPortfolioData();
  });

  useSocket('trade_update', () => {
    fetchPortfolioData();
  });

  useSocket('optionOrderExecuted', () => {
    fetchPortfolioData();
  });

  useSocket('walletUpdated', (data) => {
    if (data?.wallet) {
      setPortfolioMeta(prev => ({
        ...prev,
        balance: data.wallet.balance ?? prev?.balance,
        usedMargin: data.wallet.totalUsedMargin ?? data.wallet.usedMargin ?? prev?.usedMargin,
        availableMargin: data.wallet.availableMargin ?? prev?.availableMargin,
      }));
    }
    fetchPortfolioData();
  });

  // ── Cancel Open Order Handler ───────────────────────────────────────────────
  const handleCancelOrder = (order) => {
    const sym = order.stockSymbol || order.symbol || 'Instrument';
    Alert.alert(
      'Cancel Order',
      `Are you sure you want to cancel the open order for ${sym}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.cancelOrder(order._id);
              fetchPortfolioData();
              Alert.alert('Order Cancelled', `Order for ${sym} has been cancelled.`);
            } catch (err) {
              Alert.alert('Cancellation Failed', err.message || 'Unable to cancel order.');
            }
          },
        },
      ]
    );
  };

  // ── Square Off Handler ─────────────────────────────────────────────────────
  const handleSquareOff = async () => {
    if (!squareOffTarget || squareOffLoading) return;
    setSquareOffLoading(true);
    try {
      await api.squareOffTrade(squareOffTarget._id);
      setSquareOffTarget(null);
      Alert.alert('Position Closed', 'Position squared off at current market price.');
      fetchPortfolioData();
    } catch (e) {
      try {
        if (squareOffTarget.kind === 'equity' || squareOffTarget.kind === 'holding') {
          await api.squareOffPosition(squareOffTarget._id);
        } else {
          await api.squareOffOptionPosition(squareOffTarget._id);
        }
        setSquareOffTarget(null);
        Alert.alert('Position Closed', 'Position squared off at current market price.');
        fetchPortfolioData();
      } catch (err2) {
        Alert.alert('Square Off Failed', err2.message || 'Unable to close position.');
      }
    } finally {
      setSquareOffLoading(false);
    }
  };

  // ── Derived Totals ─────────────────────────────────────────────────────────
  const safePositions = Array.isArray(positions) ? positions : [];
  const safeClosedTrades = Array.isArray(closedTrades) ? closedTrades : [];

  const unrealizedPnL = safePositions.reduce((sum, p) => {
    if (!p) return sum;
    if (p.pnl !== undefined) return sum + (Number(p.pnl) || 0);
    const avg = Number(p.avgPrice || p.avgPremium || 0);
    const cur = Number(p.ltp || avg);
    const dir = String(p.side || 'BUY').toUpperCase() === 'BUY' ? 1 : -1;
    return sum + (cur - avg) * (Number(p.quantity) || 0) * dir;
  }, 0);

  const realizedPnL = Number(portfolioMeta?.realizedPnl ?? safeClosedTrades.reduce((sum, c) => sum + (Number(c?.pnl) || 0), 0));
  const totalPnL = Number(portfolioMeta?.totalPnl ?? (unrealizedPnL + realizedPnL));
  const marginUsed = Number(portfolioMeta?.usedMargin || 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Live Index Ticker — same as Orders screen */}
      <IndexTicker
        indexes={{}}
        onIndexPress={(name) => navigation.navigate('OptionChain', { indexName: name })}
      />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Portfolio</Text>
          <Text style={styles.headerSub}>
            {safePositions.length} active • {safeClosedTrades.length} closed
          </Text>
        </View>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live Sync</Text>
        </View>
      </View>

      {/* Segmented Control Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'OPEN' && styles.tabBtnActive]}
          onPress={() => setActiveTab('OPEN')}
        >
          <Text style={[styles.tabText, activeTab === 'OPEN' && styles.tabTextActive]}>
            Open Positions ({safePositions.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'CLOSED' && styles.tabBtnActive]}
          onPress={() => setActiveTab('CLOSED')}
        >
          <Text style={[styles.tabText, activeTab === 'CLOSED' && styles.tabTextActive]}>
            Closed Trades ({safeClosedTrades.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Wallet Capital & Margins Bar */}
      <View style={styles.walletBar}>
        <View style={styles.walletCol}>
          <Text style={styles.walletLabel}>Available Margin</Text>
          <Text style={styles.walletValAvailable}>
            {fmt(portfolioMeta?.availableMargin ?? Math.max(0, (portfolioMeta?.balance || 0) - marginUsed))}
          </Text>
        </View>
        <View style={styles.walletDivider} />
        <View style={styles.walletCol}>
          <Text style={styles.walletLabel}>Used Margin</Text>
          <Text style={styles.walletValNeutral}>{fmt(marginUsed)}</Text>
        </View>
        <View style={styles.walletDivider} />
        <View style={styles.walletCol}>
          <Text style={styles.walletLabel}>Total Balance</Text>
          <Text style={styles.walletValBold}>
            {fmt(portfolioMeta?.balance ?? 500000)}
          </Text>
        </View>
      </View>

      {/* Financial Summary Card */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>
            {activeTab === 'OPEN' ? 'Unrealised P&L' : 'Realised P&L'}
          </Text>
          <Text style={[styles.summaryValue, { color: pnlColor(activeTab === 'OPEN' ? unrealizedPnL : realizedPnL) }]}>
            {fmtPL(activeTab === 'OPEN' ? unrealizedPnL : realizedPnL)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Net P&L</Text>
          <Text style={[styles.summaryValue, { color: pnlColor(totalPnL) }]}>
            {fmtPL(totalPnL)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Margin Used</Text>
          <Text style={styles.summaryValueNeutral}>{fmt(marginUsed)}</Text>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonLoader width="100%" height={96} borderRadius={12} />
          <SkeletonLoader width="100%" height={96} borderRadius={12} />
          <SkeletonLoader width="100%" height={96} borderRadius={12} />
        </View>
      ) : (
        activeTab === 'OPEN' ? (
          <FlatList
            data={safePositions}
            keyExtractor={(item, index) => item._id || item.symbol || String(index)}
            renderItem={({ item }) => (
              <PositionCard
                position={item}
                onTradeAction={handlePositionPress}
                onSquareOff={setSquareOffTarget}
              />
            )}
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== 'web'}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchPortfolioData();
                }}
                colors={[colors.primary]}
              />
            }
            contentContainerStyle={[
              styles.scrollContent,
              safePositions.length === 0 && styles.emptyContainer,
            ]}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="pie-chart-outline" size={56} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No open positions</Text>
                <Text style={styles.emptySubtitle}>
                  You have no running trades. Tap below to view option chain or instruments.
                </Text>
                <TouchableOpacity
                  style={styles.goTradeBtn}
                  onPress={() => navigation.navigate('Chain')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.goTradeBtnText}>Explore Option Chain</Text>
                </TouchableOpacity>
              </View>
            }
          />
        ) : (
          <FlatList
            data={safeClosedTrades}
            keyExtractor={(item, index) => item._id || String(index)}
            renderItem={({ item }) => <ClosedTradeCard trade={item} />}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== 'web'}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchPortfolioData();
                }}
                colors={[colors.primary]}
              />
            }
            contentContainerStyle={[
              styles.scrollContent,
              safeClosedTrades.length === 0 && styles.emptyContainer,
            ]}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="documents-outline" size={56} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No closed trades</Text>
                <Text style={styles.emptySubtitle}>
                  Completed trades for this batch session will be archived here.
                </Text>
              </View>
            }
          />
        )
      )}

      {/* Square-off modal */}
      <SquareOffModal
        position={squareOffTarget}
        loading={squareOffLoading}
        onConfirm={handleSquareOff}
        onClose={() => setSquareOffTarget(null)}
      />

      {/* Trade Modal for Tap on Position (Buy More / Sell) */}
      <OrderBottomSheet
        visible={orderSheetVisible}
        onClose={() => setOrderSheetVisible(false)}
        onOrderPlaced={({ success }) => {
          if (success) {
            fetchPortfolioData();
          }
        }}
        instrument={sheetInstrument}
        defaultSide={sheetSide}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  cardActionHint: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
  },
  cardActionHintText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.2,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  liveText: { fontSize: 11, fontWeight: '700', color: '#059669' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#F1F5F9' },
  summaryLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4, fontWeight: '500' },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  summaryValueNeutral: { fontSize: 14, fontWeight: '700', color: colors.text },

  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: colors.textSecondary },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  closedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    opacity: 0.95,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  symbolGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  symbol: { fontSize: 14, fontWeight: '700', color: colors.text },
  expiry: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  pnlGroup: { alignItems: 'flex-end' },
  pnlVal: { fontSize: 15, fontWeight: '700' },
  pctBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  pnlPct: { fontSize: 11, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  statCol: { flex: 1 },
  statLabel: { fontSize: 10, color: colors.textSecondary, marginBottom: 2, fontWeight: '500' },
  statVal: { fontSize: 12, fontWeight: '600', color: colors.text },

  inlineSqBtn: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  inlineSqText: { fontSize: 11, fontWeight: '700', color: colors.loss },

  emptyState: { alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 14, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  goTradeBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  goTradeBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── Wallet & Margins Bar ──
  walletBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  walletCol: { flex: 1, alignItems: 'center' },
  walletDivider: { width: 1, backgroundColor: '#F1F5F9', marginHorizontal: 2 },
  walletLabel: { fontSize: 10, color: '#64748B', fontWeight: '600', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.2 },
  walletValAvailable: { fontSize: 13, fontWeight: '800', color: '#16A34A' },
  walletValNeutral: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  walletValBold: { fontSize: 13, fontWeight: '800', color: '#2563EB' },

  // ── Open Orders Section ──
  openOrdersCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    backgroundColor: '#FFFAF5',
    marginBottom: 12,
  },
  openOrdersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FFEDD5',
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F97316',
  },
  openOrdersTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9A3412',
    letterSpacing: -0.2,
  },
  viewAllOrdersLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
  },
  openOrderItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  openOrderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  miniSidePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniSidePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  openOrderSymbol: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  miniTypePill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  miniTypePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  openOrderCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    gap: 3,
  },
  openOrderCancelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  openOrderTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  openOrderTimeText: {
    fontSize: 11,
    color: '#64748B',
  },
  openOrderTimeHighlight: {
    color: '#0F172A',
    fontWeight: '700',
  },
  openOrderStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  openOrderStatItem: {
    fontSize: 11,
    color: '#64748B',
  },
  openOrderStatBold: {
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── Recent Executed Orders Section ──
  recentOrdersCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
    marginBottom: 12,
  },
  recentOrdersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
  },
  recentOrdersTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: -0.2,
  },
  viewExecutedOrdersLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  recentOrderItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
});

// ── Square Off Modal Styles ───────────────────────────────────────────────────
const sqStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  symbol: { fontSize: 14, color: colors.textSecondary, fontWeight: '600', marginBottom: 16 },

  statsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 16,
  },
  stat: { alignItems: 'center' },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 2 },
  statVal: { fontSize: 14, fontWeight: '700', color: colors.text },

  pnlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  pnlLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  pnlVal: { fontSize: 16, fontWeight: '800' },

  actions: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: colors.loss,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
