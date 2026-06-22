import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, Alert, TextInput, ScrollView, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';
import IndexTicker from '../components/IndexTicker';
import StockActionSheet from '../components/StockActionSheet';

// Memoized watchlist row — only re-renders when this symbol's own price
// changes (not when any other row in the list ticks). Keeps the list smooth
// under the live websocket price stream.
const StockRow = React.memo(function StockRow({
  symbol, ltp, change, changePercent, onOpen, onLongPress, onBuy, onSell,
}) {
  const isGain = change >= 0;
  const hasPrice = ltp > 0;
  const changeColor = isGain ? colors.gain : colors.loss;
  const ltpFormatted = hasPrice
    ? Number(ltp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const changeLine = hasPrice
    ? `${isGain ? '+' : ''}${Number(change).toFixed(2)}  ${isGain ? '+' : ''}${Number(changePercent).toFixed(2)}%`
    : '—';

  return (
    <TouchableOpacity
      style={styles.stockRow}
      onPress={() => onOpen(symbol, ltp, change, changePercent)}
      onLongPress={() => onLongPress(symbol)}
      delayLongPress={300}
      activeOpacity={0.85}
    >
      <View style={styles.stockLeft}>
        <Text style={styles.stockSymbol} numberOfLines={1}>{symbol}</Text>
        <View style={styles.stockMeta}>
          <View style={styles.exchangeBadge}>
            <Text style={styles.exchangeBadgeText}>NSE</Text>
          </View>
        </View>
      </View>

      <View style={styles.stockRight}>
        <Text style={[styles.stockLtp, { color: changeColor }]}>{ltpFormatted}</Text>
        <Text style={[styles.stockChange, { color: changeColor }]}>{changeLine}</Text>
      </View>

      <View style={styles.bsWrap}>
        <TouchableOpacity style={styles.buyBtn} onPress={() => onBuy(symbol, ltp)} activeOpacity={0.8}>
          <Text style={styles.bsBtnText}>B</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sellBtn} onPress={() => onSell(symbol, ltp)} activeOpacity={0.8}>
          <Text style={styles.bsBtnText}>S</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

export default function DashboardScreen({ navigation }) {
  const [watchlists, setWatchlists] = useState([]);
  const [activeWL, setActiveWL] = useState(0);
  const [prices, setPrices] = useState({});
  const [indexes, setIndexes] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [actionStock, setActionStock] = useState(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [newWLName, setNewWLName] = useState('');
  const [showNewWL, setShowNewWL] = useState(false);
  const searchRef = useRef(null);
  const insets = useSafeAreaInsets();

  // ─── Data fetching ───────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const [wls, market, idxRes] = await Promise.all([
        api.getWatchlists(),
        api.getLiveMarket(),
        api.getIndexes(),
      ]);
      setWatchlists(wls);
      setPrices(market.prices || {});
      setIndexes(idxRes.indexes || {});
    } catch (e) { console.warn(e.message); }
    finally { setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  useEffect(() => {
    const socket = getSocket();
    socket.on('marketData', (data) => {
      if (data.prices) setPrices(p => ({ ...p, ...data.prices }));
      if (data.indexes) setIndexes(data.indexes);
    });
    return () => socket.off('marketData');
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.searchStocks(searchQuery);
        setSearchResults(res || []);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ─── Derived state ───────────────────────────────────────────────────────────
  const currentWL = watchlists[activeWL];
  const stocks = currentWL?.stocks || [];
  const getPrice = (symbol) => prices[symbol] || {};

  // ─── Actions ─────────────────────────────────────────────────────────────────
  const addToWatchlist = async (stock) => {
    if (!currentWL) return;
    try {
      await api.addStock(currentWL._id, stock.symbol);
      setWatchlists(prev => prev.map(w =>
        w._id === currentWL._id ? { ...w, stocks: [...(w.stocks || []), stock.symbol] } : w
      ));
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const removeFromWatchlist = (symbol) => {
    Alert.alert('Remove', `Remove ${symbol} from watchlist?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.removeStock(currentWL._id, symbol);
            setWatchlists(prev => prev.map(w =>
              w._id === currentWL._id ? { ...w, stocks: w.stocks.filter(s => s !== symbol) } : w
            ));
          } catch {}
        }
      }
    ]);
  };

  const createWatchlist = async () => {
    if (!newWLName.trim()) return;
    try {
      const wl = await api.createWatchlist(newWLName.trim());
      setWatchlists(prev => [...prev, wl]);
      setNewWLName('');
      setShowNewWL(false);
      setActiveWL(watchlists.length);
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const openSearch = () => {
    setSearchVisible(true);
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  const closeSearch = () => {
    setSearchVisible(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const openActionSheet = (symbol) => {
    const p = getPrice(symbol);
    setActionStock({
      symbol,
      exchange: 'NSE',
      ltp: p.ltp ?? p.price ?? 0,
      change: p.change ?? 0,
      changePercent: p.changePercent ?? 0,
    });
  };

  const goToOrderEntry = (side) => {
    if (!actionStock) return;
    setActionStock(null);
    navigation.navigate('OrderEntry', {
      symbol: actionStock.symbol,
      ltp: actionStock.ltp,
      defaultSide: side,
    });
  };

  const goToChart = () => {
    if (!actionStock) return;
    const s = actionStock;
    setActionStock(null);
    navigation.navigate('StockDetail', {
      symbol: s.symbol,
      ltp: s.ltp,
      change: s.change,
      changePercent: s.changePercent,
    });
  };

  // ─── Stock row ────────────────────────────────────────────────────────────────
  // Stable callbacks so memoized rows don't re-render when handlers are recreated
  const handleOpen = useCallback(
    (symbol, ltp, change, changePercent) =>
      navigation.navigate('StockDetail', { symbol, ltp, change, changePercent }),
    [navigation]
  );
  const handleBuy = useCallback(
    (symbol, ltp) => navigation.navigate('OrderEntry', { symbol, ltp, defaultSide: 'BUY' }),
    [navigation]
  );
  const handleSell = useCallback(
    (symbol, ltp) => navigation.navigate('OrderEntry', { symbol, ltp, defaultSide: 'SELL' }),
    [navigation]
  );
  const handleLongPress = useCallback((symbol) => openActionSheet(symbol), [prices]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderStockRow = useCallback(({ item: symbol }) => {
    const p = prices[symbol] || {};
    return (
      <StockRow
        symbol={symbol}
        ltp={p.ltp ?? p.price ?? 0}
        change={p.change ?? 0}
        changePercent={p.changePercent ?? 0}
        onOpen={handleOpen}
        onLongPress={handleLongPress}
        onBuy={handleBuy}
        onSell={handleSell}
      />
    );
  }, [prices, handleOpen, handleLongPress, handleBuy, handleSell]);

  // ─── Empty state ──────────────────────────────────────────────────────────────
  const EmptyState = () => (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="eye-outline" size={30} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>Add instruments to track</Text>
      <Text style={styles.emptySubtitle}>Search and add stocks, F&O or ETFs</Text>
      <TouchableOpacity style={styles.emptySearchBtn} onPress={openSearch} activeOpacity={0.85}>
        <Ionicons name="search" size={14} color="#fff" style={{ marginRight: 6 }} />
        <Text style={styles.emptySearchBtnText}>Search instruments</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Index ticker strip */}
      <IndexTicker
        indexes={indexes}
        onIndexPress={(name) => navigation.navigate('IndexChart', { indexName: name })}
      />

      {/* Watchlist tab bar */}
      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
          style={styles.tabsScroll}
        >
          {watchlists.map((wl, i) => (
            <TouchableOpacity
              key={wl._id}
              style={styles.tab}
              onPress={() => setActiveWL(i)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeWL === i && styles.tabTextActive]}>
                {wl.name}
              </Text>
              {activeWL === i && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}

        </ScrollView>

        {/* Manage watchlist groups (layers +) pinned right */}
        <TouchableOpacity style={styles.layersBtn} onPress={() => setShowNewWL(true)} activeOpacity={0.7}>
          <Ionicons name="layers-outline" size={18} color={colors.primary} />
          <View style={styles.layersPlus}>
            <Ionicons name="add" size={10} color="#fff" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Inline search & add box */}
      <View style={styles.searchBarWrap}>
        <TouchableOpacity style={styles.searchBox} onPress={openSearch} activeOpacity={0.8}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <Text style={styles.searchPlaceholder}>Search & add</Text>
          <Text style={styles.searchCount}>{stocks.length}/250</Text>
          <Ionicons name="options-outline" size={18} color={colors.textSecondary} style={{ marginLeft: 10 }} />
        </TouchableOpacity>
      </View>

      {/* + New group */}
      <TouchableOpacity style={styles.newGroupRow} onPress={() => setShowNewWL(true)} activeOpacity={0.7}>
        <Ionicons name="add" size={16} color={colors.primary} />
        <Text style={styles.newGroupText}>New group</Text>
      </TouchableOpacity>

      {/* Stock list */}
      <FlatList
        data={stocks}
        keyExtractor={(item) => item}
        renderItem={renderStockRow}
        style={styles.list}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={<EmptyState />}
      />

      {/* Long-press action sheet */}
      <StockActionSheet
        visible={!!actionStock}
        stock={actionStock}
        onClose={() => setActionStock(null)}
        onBuy={() => goToOrderEntry('BUY')}
        onSell={() => goToOrderEntry('SELL')}
        onViewChart={goToChart}
      />

      {/* ── Search modal (full-screen) ───────────────────────────────────────── */}
      <Modal visible={searchVisible} animationType="slide" onRequestClose={closeSearch}>
        <View style={[styles.searchModal, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.searchHeader}>
            <TouchableOpacity onPress={closeSearch} style={styles.searchBackBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              placeholder="Search eg. INFY, NIFTY..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Results */}
          <FlatList
            data={searchResults.slice(0, 20)}
            keyExtractor={(item) => item.symbol}
            keyboardShouldPersistTaps="always"
            ListHeaderComponent={
              searchResults.length === 0 && searchQuery.length === 0 ? (
                <View style={styles.searchHint}>
                  <Ionicons name="search-outline" size={36} color={colors.textMuted} style={{ marginBottom: 10 }} />
                  <Text style={styles.searchHintText}>Search across 90,000+ instruments</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const isAdded = stocks.includes(item.symbol);
              return (
                <TouchableOpacity
                  style={styles.searchResult}
                  onPress={() => {
                    if (!isAdded) addToWatchlist(item);
                    closeSearch();
                    navigation.navigate('StockDetail', { symbol: item.symbol, ltp: 0 });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.searchResultLeft}>
                    <Text style={styles.searchResultSymbol}>{item.symbol}</Text>
                    <Text style={styles.searchResultName} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <View style={styles.searchResultRight}>
                    <View style={styles.searchExchangePill}>
                      <Text style={styles.searchExchangeText}>NSE</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.addBtn, isAdded && styles.addBtnAdded]}
                      onPress={() => { if (!isAdded) addToWatchlist(item); }}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={isAdded ? 'checkmark' : 'add'}
                        size={16}
                        color={isAdded ? colors.gain : colors.primary}
                      />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              searchQuery.length > 0 ? (
                <View style={styles.searchEmpty}>
                  <Text style={styles.searchEmptyText}>No results for "{searchQuery}"</Text>
                </View>
              ) : null
            }
          />
        </View>
      </Modal>

      {/* ── New watchlist bottom sheet ───────────────────────────────────────── */}
      <Modal
        visible={showNewWL}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewWL(false)}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setShowNewWL(false)}
            activeOpacity={1}
          />
          <View style={[styles.newWLSheet, { paddingBottom: insets.bottom + 12 }]}>
            {/* Drag handle */}
            <View style={styles.sheetHandle} />
            <Text style={styles.newWLTitle}>Create watchlist</Text>
            <TextInput
              style={styles.newWLInput}
              placeholder="Watchlist name"
              placeholderTextColor={colors.textMuted}
              value={newWLName}
              onChangeText={setNewWLName}
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={createWatchlist}
            />
            <View style={styles.newWLBtns}>
              <TouchableOpacity
                style={styles.newWLCancelBtn}
                onPress={() => { setShowNewWL(false); setNewWLName(''); }}
                activeOpacity={0.8}
              >
                <Text style={styles.newWLCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.newWLCreateBtn, !newWLName.trim() && { opacity: 0.5 }]}
                onPress={createWatchlist}
                activeOpacity={0.85}
                disabled={!newWLName.trim()}
              >
                <Text style={styles.newWLCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,   // #FAFAFA
  },

  // ── Watchlist tab bar ─────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: '#F0F1F3',
  },
  tabsScroll: { flex: 1 },
  tabsContent: {
    paddingHorizontal: 4,
    alignItems: 'flex-end',
  },
  tab: {
    paddingHorizontal: 14,
    height: 44,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    paddingBottom: 10,
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  // Manage groups (layers +) button
  layersBtn: {
    width: 44, height: 44,
    justifyContent: 'center', alignItems: 'center',
  },
  layersPlus: {
    position: 'absolute', top: 9, right: 6,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },

  // ── Inline search & add box ───────────────────────────────────────────────
  searchBarWrap: {
    backgroundColor: '#F0F1F3',
    paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 8,
    paddingHorizontal: 14, height: 46,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  searchPlaceholder: { flex: 1, marginLeft: 10, fontSize: 15, color: colors.textMuted },
  searchCount: { fontSize: 13, color: colors.textMuted },

  // ── New group link ────────────────────────────────────────────────────────
  newGroupRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 2, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  newGroupText: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  // ── Stock list ────────────────────────────────────────────────────────────
  list: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  // ── Stock row ─────────────────────────────────────────────────────────────
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight, // #F1F3F4
  },
  stockLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  stockSymbol: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.text,              // #1E1E1E
    letterSpacing: -0.2,
  },
  stockMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  exchangeBadge: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: '#EFF6FF',
  },
  exchangeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 0.2,
  },
  stockRight: {
    alignItems: 'flex-end',
    marginRight: 10,
    minWidth: 96,
  },
  stockLtp: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,              // #1E1E1E
    letterSpacing: -0.1,
  },
  stockChange: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
  },

  // ── B / S buttons ─────────────────────────────────────────────────────────
  bsWrap: {
    flexDirection: 'row',
    gap: 5,
  },
  buyBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: colors.gain,    // #25B87E
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: colors.loss,    // #E64D3D
    justifyContent: 'center',
    alignItems: 'center',
  },
  bsBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 14,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 90,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptySearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  emptySearchBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },

  // ── Search modal ──────────────────────────────────────────────────────────
  searchModal: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 52,
  },
  searchBackBtn: {
    padding: 6,
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  searchHint: {
    paddingTop: 60,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  searchHintText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  searchResultLeft: {
    flex: 1,
    marginRight: 10,
  },
  searchResultSymbol: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  searchResultName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    maxWidth: 220,
  },
  searchResultRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchExchangePill: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  searchExchangeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 0.2,
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnAdded: {
    backgroundColor: colors.gainLight,
  },
  searchEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  searchEmptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  // ── New watchlist bottom sheet ────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  newWLSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 18,
  },
  newWLTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  newWLInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surfaceLight,
    marginBottom: 20,
  },
  newWLBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  newWLCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  newWLCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  newWLCreateBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  newWLCreateText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
