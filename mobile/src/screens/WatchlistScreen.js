import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
  TextInput, RefreshControl, StatusBar, Keyboard, Alert,
  Modal, Pressable, KeyboardAvoidingView, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import useThrottledSocket from '../hooks/useThrottledSocket';
import { useLiveSymbol, marketStore } from '../store/marketStore';
import OrderBottomSheet from '../components/order/OrderBottomSheet';
import RejectionReasonModal from '../components/order/RejectionReasonModal';
import SkeletonLoader from '../components/SkeletonLoader';
import IndexTicker from '../components/IndexTicker';

// ── Option lot sizes & pattern parser ─────────────────────────────────────────
const OPTION_LOT_SIZES = {
  'NIFTY': 75, 'NIFTY 50': 75,
  'BANKNIFTY': 30, 'BANK NIFTY': 30,
  'SENSEX': 20, 'FINNIFTY': 65,
  'MIDCPNIFTY': 120, 'BANKEX': 30,
};

function parseOptionQuery(q) {
  if (!q) return null;
  const raw = q.trim().toUpperCase();
  const match = raw.match(/^([A-Z0-9\s]+?)\s*(\d{3,6})(?:\.\d+)?\s*(CE|PE)$/i);
  if (match) {
    let underlying = match[1].trim();
    const strike = parseInt(match[2], 10);
    const optType = match[3].toUpperCase();
    const cu = underlying.replace(/\s+/g, '');
    if (cu === 'NIFTY') underlying = 'NIFTY 50';
    else if (cu === 'BANKNIFTY') underlying = 'BANK NIFTY';
    else if (cu === 'FINNIFTY') underlying = 'FINNIFTY';
    else if (cu === 'MIDCPNIFTY' || cu === 'MIDCAP') underlying = 'MIDCPNIFTY';
    else if (cu === 'SENSEX' || cu === 'BSE') underlying = 'SENSEX';
    const shortIdx = underlying === 'NIFTY 50' ? 'NIFTY' : (underlying === 'BANK NIFTY' ? 'BANKNIFTY' : underlying);
    return {
      underlyingSymbol: underlying,
      strikePrice: strike,
      optionType: optType,
      compositeSymbol: `${shortIdx} ${strike} ${optType}`,
      name: `${shortIdx} ${strike} ${optType}`,
      lotSize: OPTION_LOT_SIZES[underlying] || 50,
      isOption: true,
    };
  }
  return null;
}

function buildSearchResults(apiResults, query) {
  const optionHit = parseOptionQuery(query);
  const results = [...(apiResults || [])];
  if (optionHit) {
    const already = results.some(r => (r.compositeSymbol || r.symbol || '').toUpperCase() === optionHit.compositeSymbol.toUpperCase());
    if (!already) results.unshift(optionHit);
  }
  return results;
}

const ASSET_TABS = [
  { id: 'CUSTOM',      label: 'My Lists',    icon: 'bookmark' },
  { id: 'CRYPTO',      label: 'Crypto',      icon: 'logo-bitcoin' },
  { id: 'COMMODITIES', label: 'Commodities', icon: 'cube-outline' },
  { id: 'FOREX',       label: 'Forex',       icon: 'cash-outline' },
];

const GLOBAL_PRESETS = {
  CRYPTO: [
    { symbol: 'BTCUSDT',  name: 'Bitcoin',   category: 'CRYPTO', currency: 'USD' },
    { symbol: 'ETHUSDT',  name: 'Ethereum',  category: 'CRYPTO', currency: 'USD' },
    { symbol: 'SOLUSDT',  name: 'Solana',    category: 'CRYPTO', currency: 'USD' },
    { symbol: 'BNBUSDT',  name: 'BNB',       category: 'CRYPTO', currency: 'USD' },
    { symbol: 'XRPUSDT',  name: 'Ripple',    category: 'CRYPTO', currency: 'USD' },
    { symbol: 'DOGEUSDT', name: 'Dogecoin',  category: 'CRYPTO', currency: 'USD' },
    { symbol: 'ADAUSDT',  name: 'Cardano',   category: 'CRYPTO', currency: 'USD' },
    { symbol: 'AVAXUSDT', name: 'Avalanche', category: 'CRYPTO', currency: 'USD' },
  ],
  COMMODITIES: [
    { symbol: 'PAXGUSDT',       name: 'Gold (USD)',       category: 'COMMODITIES', currency: 'USD' },
    { symbol: 'MCX GOLD',       name: 'MCX Gold Futures', category: 'COMMODITIES', currency: 'INR' },
    { symbol: 'MCX SILVER',     name: 'MCX Silver',       category: 'COMMODITIES', currency: 'INR' },
    { symbol: 'MCX CRUDEOIL',   name: 'MCX Crude Oil',    category: 'COMMODITIES', currency: 'INR' },
    { symbol: 'MCX NATURALGAS', name: 'MCX Natural Gas',  category: 'COMMODITIES', currency: 'INR' },
  ],
  FOREX: [
    { symbol: 'USDINR',  name: 'USD / INR', category: 'FOREX', currency: 'INR' },
    { symbol: 'EURUSDT', name: 'EUR / USD', category: 'FOREX', currency: 'USD' },
    { symbol: 'GBPUSDT', name: 'GBP / USD', category: 'FOREX', currency: 'USD' },
  ],
};

const CAT_COLOR = {
  CRYPTO:      { bg: '#F3E8FF', fg: '#9333EA' },
  COMMODITIES: { bg: '#FEF3C7', fg: '#D97706' },
  COMMODITY:   { bg: '#FEF3C7', fg: '#D97706' },
  FOREX:       { bg: '#E0F2FE', fg: '#0284C7' },
};

const fmt = (n, isUsd) => {
  const num = Number(n) || 0;
  const sym = isUsd ? '$' : '\u20b9';
  const d = (isUsd && num > 0 && num < 1) ? 4 : 2;
  return sym + num.toLocaleString(isUsd ? 'en-US' : 'en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
};

// ── InstrumentRow ─────────────────────────────────────────────────────────────
const InstrumentRow = React.memo(function InstrumentRow({
  symbol, name, category: propCategory, currency: propCurrency,
  initialLtp, initialChange, initialChangePercent, onPress, onRemove,
}) {
  const live   = useLiveSymbol(symbol);
  const ltp    = live?.ltp ?? initialLtp ?? 0;
  const chg    = Number(live?.change ?? initialChange ?? 0);
  const chgPct = Number(live?.changePercent ?? initialChangePercent ?? 0);
  const isGain = chg >= 0;

  const isUsd = propCurrency === 'USD' || live?.currency === 'USD' || live?.isUsd
    || symbol.endsWith('USDT') || symbol.startsWith('PAXG');
  const category = propCategory || live?.category
    || (symbol.endsWith('USDT') ? 'CRYPTO' : (symbol.startsWith('MCX') ? 'COMMODITIES' : null));

  const opt = parseOptionQuery(symbol) || (live?.isOption ? {
    underlyingSymbol: live.underlyingSymbol,
    strikePrice: live.strikePrice,
    optionType: live.optionType,
  } : null);

  const handlePress  = useCallback(() => onPress?.(symbol), [onPress, symbol]);
  const handleRemove = useCallback((e) => { e.stopPropagation(); onRemove?.(symbol); }, [onRemove, symbol]);

  const catColor = CAT_COLOR[category] || null;

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.72}>
      <View style={styles.cardLeft}>
        <View style={styles.symbolRow}>
          <Text style={styles.symbolText} numberOfLines={1}>{symbol}</Text>
          {opt ? (
            <View style={[styles.badge, { backgroundColor: opt.optionType === 'CE' ? '#DCFCE7' : '#FEE2E2' }]}>
              <Text style={[styles.badgeText, { color: opt.optionType === 'CE' ? '#16A34A' : '#DC2626' }]}>{opt.optionType}</Text>
            </View>
          ) : catColor ? (
            <View style={[styles.badge, { backgroundColor: catColor.bg }]}>
              <Text style={[styles.badgeText, { color: catColor.fg }]}>
                {category === 'COMMODITIES' ? 'COMDTY' : category}
              </Text>
            </View>
          ) : null}
        </View>
        {opt
          ? <Text style={styles.subText}>{opt.underlyingSymbol} \u00b7 {opt.strikePrice}</Text>
          : (name && name !== symbol ? <Text style={styles.subText} numberOfLines={1}>{name}</Text> : null)
        }
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.priceText}>{fmt(ltp, isUsd)}</Text>
        <Text style={[styles.changeText, { color: isGain ? colors.gain : colors.loss }]}>
          {isGain ? '+' : ''}{chgPct.toFixed(2)}%
        </Text>
      </View>
      {onRemove && (
        <TouchableOpacity style={styles.removeBtn} onPress={handleRemove} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function WatchlistScreen({ navigation }) {
  const insets        = useSafeAreaInsets();
  const searchInputRef = useRef(null);
  const tabsScrollRef  = useRef(null);

  const [watchlists,    setWatchlists]    = useState([]);
  const [selectedId,    setSelectedId]    = useState(null);
  const [activeAssetTab, setActiveAssetTab] = useState('CUSTOM');
  const [livePrices,    setLivePrices]    = useState({});
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [sheetVisible,    setSheetVisible]    = useState(false);
  const [sheetInstrument, setSheetInstrument] = useState(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newListName,   setNewListName]   = useState('');
  const [rejectionVisible,   setRejectionVisible]   = useState(false);
  const [rejectionReason,    setRejectionReason]    = useState('');
  const [rejectionOrderInfo, setRejectionOrderInfo] = useState(null);

  // Cache-first load
  useEffect(() => {
    (async () => {
      try {
        const cached = await AsyncStorage.getItem('cache:watchlists');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setWatchlists(parsed);
            setSelectedId(parsed[0]._id);
            setLoading(false);
          }
        }
      } catch (e) { console.warn('Cache load error:', e.message); }
    })();
  }, []);

  const fetchWatchlists = useCallback(async (isRefresh = false, targetSelectId = null) => {
    try {
      if (!isRefresh) setLoading(true);
      const data = await api.getWatchlists().catch(err => { console.warn(err.message); return []; });
      if (Array.isArray(data) && data.length > 0) {
        setWatchlists(data);
        AsyncStorage.setItem('cache:watchlists', JSON.stringify(data)).catch(() => {});
        setSelectedId(prev => {
          if (targetSelectId && data.some(w => w._id === targetSelectId)) return targetSelectId;
          if (prev && data.some(w => w._id === prev)) return prev;
          return data[0]._id;
        });
      }
      const liveData = await api.getLiveMarket().catch(() => null);
      if (liveData?.prices) { setLivePrices(liveData.prices); marketStore.seed(liveData.prices, liveData.indexes); }
    } catch (e) { console.warn('Watchlist fetch error:', e.message); }
    finally { if (!isRefresh) setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { fetchWatchlists(); }, [fetchWatchlists]));

  useThrottledSocket('marketData', (data) => {
    const updates = data?.diff || data?.prices;
    if (updates) setLivePrices(prev => ({ ...prev, ...updates }));
  }, 250);

  // Search debounce
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const optionHit = parseOptionQuery(searchQuery);
    if (optionHit) setSearchResults([optionHit]);
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.searchInstruments(searchQuery);
        setSearchResults(buildSearchResults(res, searchQuery));
      } catch (e) { if (optionHit) setSearchResults([optionHit]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const activeWatchlist = (selectedId && watchlists.find(w => w._id === selectedId)) || watchlists[0] || null;
  const activeStocks    = activeWatchlist?.stocks || [];

  const handleToggleStockInSearch = async (symbol) => {
    let target = activeWatchlist;
    if (!target) {
      if (watchlists.length > 0) { target = watchlists[0]; setSelectedId(target._id); }
      else {
        try { target = await api.createWatchlist('My Watchlist'); setWatchlists([target]); setSelectedId(target._id); }
        catch (e) { Alert.alert('Watchlist', 'Please create a watchlist first.'); return; }
      }
    }
    const symUpper = symbol.toUpperCase();
    const isAlreadyAdded = (target.stocks || []).includes(symUpper);
    if (isAlreadyAdded) {
      setWatchlists(prev => prev.map(w => w._id === target._id ? { ...w, stocks: (w.stocks||[]).filter(s => s !== symUpper) } : w));
      try { await api.removeStockFromWatchlist(target._id, symUpper); }
      catch (e) { fetchWatchlists(true, target._id); }
    } else {
      setWatchlists(prev => prev.map(w => w._id === target._id ? { ...w, stocks: [...(w.stocks||[]), symUpper] } : w));
      try {
        await api.addStockToWatchlist(target._id, symUpper);
        setSearchQuery(''); Keyboard.dismiss(); setSelectedId(target._id);
        await fetchWatchlists(true, target._id);
      } catch (e) { Alert.alert('Watchlist', e.message || 'Failed to add'); fetchWatchlists(true, target._id); }
    }
  };

  const handleRemoveStock = useCallback(async (symbol) => {
    if (!activeWatchlist) return;
    const symUpper = symbol.toUpperCase();
    setWatchlists(prev => prev.map(w => w._id === activeWatchlist._id ? { ...w, stocks: (w.stocks||[]).filter(s => s !== symUpper) } : w));
    try { await api.removeStockFromWatchlist(activeWatchlist._id, symUpper); }
    catch (e) { Alert.alert('Error', e.message || 'Failed to remove'); fetchWatchlists(true, activeWatchlist._id); }
  }, [activeWatchlist, fetchWatchlists]);

  const handleCreateWatchlist = () => { setNewListName(`Watchlist ${watchlists.length + 1}`); setCreateModalVisible(true); };

  const submitCreateWatchlist = async () => {
    const name = newListName.trim();
    if (!name) return;
    try {
      setCreateModalVisible(false); setNewListName('');
      const newList = await api.createWatchlist(name);
      if (newList?._id) {
        setSelectedId(newList._id);
        setWatchlists(prev => [...prev.filter(w => w._id !== newList._id), newList]);
        setTimeout(() => tabsScrollRef.current?.scrollToEnd({ animated: true }), 150);
      }
      await fetchWatchlists(true, newList?._id);
    } catch (e) { Alert.alert('Error', e.message || 'Failed to create'); }
  };

  const handleDeleteWatchlist = (id, name) => {
    if (watchlists.length <= 1) { Alert.alert('Default Watchlist', 'You must have at least one watchlist.'); return; }
    Alert.alert('Delete Watchlist', `Delete "${name || 'this watchlist'}" and all its scripts?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const remaining = watchlists.filter(w => w._id !== id);
        setWatchlists(remaining);
        if (remaining.length > 0) setSelectedId(remaining[0]._id);
        try { await api.deleteWatchlist(id); await fetchWatchlists(true, remaining[0]?._id); }
        catch (e) { Alert.alert('Error', e.message || 'Failed to delete'); fetchWatchlists(true); }
      }},
    ]);
  };

  const openOrderSheet = useCallback((symbol) => {
    const p = marketStore.getPrice(symbol) || livePrices[symbol] || { ltp: 0 };
    const opt = parseOptionQuery(symbol);
    if (opt || p.isOption) {
      const underlying = opt?.underlyingSymbol || p.underlyingSymbol || 'NIFTY 50';
      setSheetInstrument({ underlyingSymbol: underlying, strikePrice: opt?.strikePrice || p.strikePrice, optionType: opt?.optionType || p.optionType, expiry: opt?.expiry || p.expiry || 'NEAR', ltp: p.ltp || 0, lotSize: p.lotSize || OPTION_LOT_SIZES[underlying] || 50 });
    } else {
      setSheetInstrument({ underlyingSymbol: symbol, strikePrice: null, optionType: null, expiry: null, ltp: p.ltp || 0, lotSize: 1 });
    }
    setSheetVisible(true);
  }, [livePrices]);

  const handleOrderResult = useCallback(({ success, error }) => {
    if (!success) {
      setRejectionReason(typeof error === 'string' ? error : (error?.message || 'Order was rejected'));
      setRejectionOrderInfo(sheetInstrument ? { side: 'BUY', symbol: sheetInstrument.underlyingSymbol || 'Stock', lots: 1 } : null);
      setRejectionVisible(true);
    }
  }, [sheetInstrument]);

  const renderWatchItem = useCallback(({ item }) => {
    const sym      = typeof item === 'string' ? item : item.symbol;
    const name     = typeof item === 'object' ? item.name     : undefined;
    const category = typeof item === 'object' ? item.category : undefined;
    const currency = typeof item === 'object' ? item.currency : undefined;
    const initial  = livePrices[sym];
    return (
      <InstrumentRow
        symbol={sym} name={name} category={category} currency={currency}
        initialLtp={initial?.ltp} initialChange={initial?.change} initialChangePercent={initial?.changePercent}
        onPress={openOrderSheet}
        onRemove={activeAssetTab === 'CUSTOM' ? handleRemoveStock : undefined}
      />
    );
  }, [openOrderSheet, handleRemoveStock, livePrices, activeAssetTab]);

  const isCustomTab   = activeAssetTab === 'CUSTOM';
  const displayStocks = isCustomTab ? activeStocks : (GLOBAL_PRESETS[activeAssetTab] || []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <IndexTicker indexes={{}} onIndexPress={(name) => navigation.navigate('OptionChain', { indexName: name })} />

      {/* Compact Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Watchlist</Text>
          {isCustomTab && activeWatchlist
            ? <Text style={styles.headerCount}>{activeStocks.length} scripts</Text>
            : !isCustomTab ? <Text style={styles.headerCount}>Live \u00b7 24/7</Text> : null}
        </View>
        <View style={styles.headerRight}>
          {isCustomTab && activeWatchlist && watchlists.length > 1 && (
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => handleDeleteWatchlist(activeWatchlist._id, activeWatchlist.name)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={17} color={colors.loss} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.optionChainPill}
            onPress={() => navigation.navigate('OptionChain', { indexName: 'NIFTY 50' })}
            activeOpacity={0.8}
          >
            <Ionicons name="git-network-outline" size={13} color="#4F46E5" />
            <Text style={styles.optionChainPillText}>Chain</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Unified Tab Bar */}
      <View style={styles.unifiedTabBar}>
        <ScrollView ref={tabsScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unifiedTabScroll}>
          {ASSET_TABS.map((tab) => {
            const isActive = activeAssetTab === tab.id;
            return (
              <TouchableOpacity key={tab.id} style={[styles.assetPill, isActive && styles.assetPillActive]} onPress={() => setActiveAssetTab(tab.id)} activeOpacity={0.75}>
                <Ionicons name={tab.icon} size={12} color={isActive ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.assetPillText, isActive && styles.assetPillTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
          {isCustomTab && <View style={styles.tabDivider} />}
          {isCustomTab && watchlists.map((wl) => {
            const isActive = activeWatchlist?._id === wl._id;
            return (
              <TouchableOpacity key={wl._id} style={[styles.listTab, isActive && styles.listTabActive]} onPress={() => setSelectedId(wl._id)} activeOpacity={0.7}>
                <Text style={[styles.listTabText, isActive && styles.listTabTextActive]}>{wl.name}</Text>
              </TouchableOpacity>
            );
          })}
          {isCustomTab && (
            <TouchableOpacity style={styles.addTabBtn} onPress={handleCreateWatchlist} activeOpacity={0.7}>
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={styles.addTabText}>New</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search stock or option (e.g. NIFTY 23450 CE)\u2026"
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); Keyboard.dismiss(); }} style={styles.searchClearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.searchClearText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {searchQuery.length > 0 ? (
          <View style={styles.searchResults}>
            <Text style={styles.searchResultsLabel}>
              {searching ? 'Searching\u2026' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
            </Text>
            {searching ? (
              <View style={{ padding: 16, gap: 10 }}>
                {[...Array(4)].map((_, i) => <SkeletonLoader key={i} width="100%" height={58} borderRadius={8} />)}
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={44} color={colors.border} />
                <Text style={styles.emptyTitle}>No matching scripts</Text>
                <Text style={styles.emptySub}>Try a different symbol or company name.</Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.compositeSymbol || item.symbol}
                renderItem={({ item }) => {
                  const sym = item.compositeSymbol || item.symbol;
                  const symUpper = sym.toUpperCase();
                  const isAdded = activeStocks.map(s => (typeof s === 'string' ? s : s.symbol).toUpperCase()).includes(symUpper);
                  const live = livePrices[symUpper] || livePrices[item.symbol?.toUpperCase()] || {};
                  const isUsd = item.currency === 'USD' || sym.endsWith('USDT');
                  return (
                    <View style={styles.searchRow}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.symbolRow}>
                          <Text style={styles.searchSymbol}>{sym}</Text>
                          {item.isOption && (
                            <View style={[styles.badge, { backgroundColor: item.optionType === 'CE' ? '#DCFCE7' : '#FEE2E2' }]}>
                              <Text style={[styles.badgeText, { color: item.optionType === 'CE' ? '#16A34A' : '#DC2626' }]}>{item.optionType}</Text>
                            </View>
                          )}
                          {item.category && !item.isOption && CAT_COLOR[item.category] && (
                            <View style={[styles.badge, { backgroundColor: CAT_COLOR[item.category].bg }]}>
                              <Text style={[styles.badgeText, { color: CAT_COLOR[item.category].fg }]}>
                                {item.category === 'COMMODITIES' ? 'COMDTY' : item.category}
                              </Text>
                            </View>
                          )}
                        </View>
                        {item.name && <Text style={styles.searchName} numberOfLines={1}>{item.name}</Text>}
                        {item.isOption && <Text style={styles.searchOptionMeta}>{item.underlyingSymbol} \u00b7 {item.strikePrice}</Text>}
                        {(live.ltp || item.ltp) ? <Text style={styles.searchLtp}>{fmt(live.ltp || item.ltp, isUsd)}</Text> : null}
                      </View>
                      <TouchableOpacity style={[styles.addBtn, isAdded && styles.addBtnAdded]} onPress={() => handleToggleStockInSearch(sym)} activeOpacity={0.7}>
                        <Ionicons name={isAdded ? 'checkmark' : 'add'} size={15} color={isAdded ? colors.gain : '#FFFFFF'} />
                        <Text style={[styles.addBtnText, isAdded && styles.addBtnTextAdded]}>{isAdded ? 'Added' : 'Add'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 100 }}
              />
            )}
          </View>
        ) : loading ? (
          <View style={{ padding: 16, gap: 10 }}>
            {[...Array(6)].map((_, i) => <SkeletonLoader key={i} width="100%" height={64} borderRadius={8} />)}
          </View>
        ) : displayStocks.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="list-outline" size={36} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{activeWatchlist?.name ? `"${activeWatchlist.name}" is empty` : 'No scripts yet'}</Text>
            <Text style={styles.emptySub}>Search and add stocks, crypto or options to track live prices.</Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => searchInputRef.current?.focus()}>
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.emptyAddBtnText}>Add Scripts</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={displayStocks}
            keyExtractor={(item) => (typeof item === 'string' ? item : item.symbol)}
            renderItem={renderWatchItem}
            getItemLayout={(_, index) => ({ length: 62, offset: 62 * index, index })}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== 'web'}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchWatchlists(true, activeWatchlist?._id); }}
                colors={[colors.primary]}
              />
            }
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}
      </View>

      <OrderBottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} onOrderPlaced={handleOrderResult} instrument={sheetInstrument} defaultSide="BUY" />
      <RejectionReasonModal visible={rejectionVisible} reason={rejectionReason} orderInfo={rejectionOrderInfo} onClose={() => setRejectionVisible(false)} />

      <Modal visible={createModalVisible} transparent animationType="fade" onRequestClose={() => setCreateModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCreateModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', maxWidth: 360 }}>
            <Pressable style={styles.modalCard}>
              <Text style={styles.modalTitle}>New Watchlist</Text>
              <Text style={styles.modalSubtitle}>Name your custom list to track stocks and options:</Text>
              <TextInput
                style={styles.modalInput}
                value={newListName}
                onChangeText={setNewListName}
                placeholder="e.g. Banking Stocks, Tech Watch"
                placeholderTextColor={colors.textMuted}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submitCreateWatchlist}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCreateModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCreateBtn} onPress={submitCreateWatchlist}>
                  <Text style={styles.modalCreateText}>Create</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  headerCount: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: { padding: 4 },
  optionChainPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: '#C7D2FE',
  },
  optionChainPillText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },

  unifiedTabBar: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  unifiedTabScroll: { paddingHorizontal: 14, paddingVertical: 8, gap: 6, alignItems: 'center' },

  assetPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, backgroundColor: '#F1F5F9',
  },
  assetPillActive:     { backgroundColor: '#0F172A' },
  assetPillText:       { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  assetPillTextActive: { color: '#FFFFFF', fontWeight: '700' },

  tabDivider: { width: 1, height: 18, backgroundColor: '#E2E8F0', marginHorizontal: 4 },

  listTab: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F1F5F9' },
  listTabActive: { backgroundColor: 'rgba(26,115,232,0.10)', borderWidth: 1, borderColor: 'rgba(26,115,232,0.35)' },
  listTabText:       { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  listTabTextActive: { color: colors.primary, fontWeight: '700' },

  addTabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed',
  },
  addTabText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 8,
  },
  searchIcon:  { position: 'absolute', left: 28, zIndex: 1 },
  searchInput: {
    flex: 1, height: 38, backgroundColor: '#F1F5F9',
    borderRadius: 10, paddingLeft: 36, paddingRight: 12,
    fontSize: 13, color: colors.text, fontWeight: '500',
  },
  searchClearBtn:  { paddingHorizontal: 8, paddingVertical: 6 },
  searchClearText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  content:      { flex: 1 },
  searchResults: { flex: 1, backgroundColor: '#FFFFFF' },
  searchResultsLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  searchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
  },
  searchSymbol:     { fontSize: 14, fontWeight: '700', color: colors.text },
  searchName:       { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  searchLtp:        { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 2 },
  searchOptionMeta: { fontSize: 11, color: '#6366f1', fontWeight: '600', marginTop: 2 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
  },
  addBtnAdded:     { backgroundColor: 'rgba(38,166,154,0.10)', borderWidth: 1, borderColor: colors.gain },
  addBtnText:      { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  addBtnTextAdded: { color: colors.gain },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC', minHeight: 62,
  },
  cardLeft:   { flex: 1 },
  symbolRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  symbolText: { fontSize: 14, fontWeight: '700', color: colors.text },
  subText:    { fontSize: 11, color: colors.textSecondary },
  cardRight:  { alignItems: 'flex-end', marginRight: 12 },
  priceText:  { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  changeText: { fontSize: 11, fontWeight: '600' },
  removeBtn:  { padding: 6 },

  badge:     { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36, gap: 8 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(26,115,232,0.08)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptySub:     { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  emptyAddBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 20, marginTop: 8,
  },
  emptyAddBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  modalTitle:    { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 },
  modalInput: {
    height: 46, backgroundColor: '#F1F5F9', borderRadius: 12,
    paddingHorizontal: 16, fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 18,
  },
  modalActions:    { flexDirection: 'row', gap: 10 },
  modalCancelBtn:  { flex: 1, height: 42, borderRadius: 12, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  modalCreateBtn:  { flex: 1, height: 42, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  modalCreateText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
