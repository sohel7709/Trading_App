import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, RefreshControl, StatusBar, Keyboard, Alert,
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

const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const InstrumentRow = React.memo(function InstrumentRow({ symbol, name, initialLtp, initialChange, initialChangePercent, onPress, onRemove }) {
  const live = useLiveSymbol(symbol);
  const ltp = live?.ltp ?? initialLtp ?? 0;
  const chg = Number(live?.change ?? initialChange ?? 0);
  const chgPct = Number(live?.changePercent ?? initialChangePercent ?? 0);
  const isGain = chg >= 0;

  const handlePress = useCallback(() => {
    onPress?.(symbol);
  }, [onPress, symbol]);

  const handleRemove = useCallback((e) => {
    e.stopPropagation();
    onRemove?.(symbol);
  }, [onRemove, symbol]);

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.75}>
      <View style={styles.cardLeft}>
        <Text style={styles.symbolText}>{symbol}</Text>
        {name && name !== symbol && (
          <Text style={styles.companyText} numberOfLines={1}>{name}</Text>
        )}
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.priceText}>{fmt(ltp)}</Text>
        <Text style={[styles.changeText, { color: isGain ? colors.gain : colors.loss }]}>
          {isGain ? '+' : ''}{chg.toFixed(2)} ({isGain ? '+' : ''}{chgPct.toFixed(2)}%)
        </Text>
      </View>
      {onRemove && (
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={handleRemove}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

export default function WatchlistScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef(null);
  const tabsScrollRef = useRef(null);
  
  // Data state: track active watchlist by its unique ID
  const [watchlists, setWatchlists] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  
  // Modal state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetInstrument, setSheetInstrument] = useState(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [rejectionVisible, setRejectionVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionOrderInfo, setRejectionOrderInfo] = useState(null);

  // ── Cache-First Load on Mount ──
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
      } catch (e) {
        console.warn('Watchlists cache load error:', e.message);
      }
    })();
  }, []);

  const fetchWatchlists = useCallback(async (isRefresh = false, targetSelectId = null) => {
    try {
      if (!isRefresh) setLoading(true);
      const data = await api.getWatchlists().catch(err => {
        console.warn('Watchlists fetch error:', err.message);
        return [];
      });
      if (Array.isArray(data) && data.length > 0) {
        setWatchlists(data);
        AsyncStorage.setItem('cache:watchlists', JSON.stringify(data)).catch(() => {});
        setSelectedId(prev => {
          if (targetSelectId && data.some(w => w._id === targetSelectId)) {
            return targetSelectId;
          }
          if (prev && data.some(w => w._id === prev)) {
            return prev;
          }
          return data[0]._id;
        });
      }
      
      const liveData = await api.getLiveMarket().catch(() => null);
      if (liveData?.prices) {
        setLivePrices(liveData.prices);
        marketStore.seed(liveData.prices, liveData.indexes);
      }
    } catch (e) {
      console.warn('Watchlist fetch error:', e.message);
    } finally {
      if (!isRefresh) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchWatchlists();
  }, [fetchWatchlists]));

  // Throttled 250ms socket ingestion with delta merging
  useThrottledSocket('marketData', (data) => {
    const updates = data?.diff || data?.prices;
    if (updates) {
      setLivePrices((prev) => ({ ...prev, ...updates }));
    }
  }, 250);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.searchInstruments(searchQuery);
        setSearchResults(res || []);
      } catch (e) {
        console.warn('Search error', e);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Derive active watchlist deterministically from selectedId
  const activeWatchlist = (selectedId && watchlists.find(w => w._id === selectedId)) || watchlists[0] || null;
  const activeStocks = activeWatchlist?.stocks || [];

  // Toggle adding or removing stock from active watchlist during search
  const handleToggleStockInSearch = async (symbol) => {
    let target = activeWatchlist;
    if (!target) {
      if (watchlists.length > 0) {
        target = watchlists[0];
        setSelectedId(target._id);
      } else {
        try {
          target = await api.createWatchlist('My Watchlist');
          setWatchlists([target]);
          setSelectedId(target._id);
        } catch (e) {
          Alert.alert('Watchlist', 'Please create a watchlist first.');
          return;
        }
      }
    }

    const symUpper = symbol.toUpperCase();
    const isAlreadyAdded = (target.stocks || []).includes(symUpper);

    if (isAlreadyAdded) {
      // Optimistically remove
      setWatchlists(prev => prev.map(w => {
        if (w._id === target._id) {
          return { ...w, stocks: (w.stocks || []).filter(s => s !== symUpper) };
        }
        return w;
      }));
      try {
        await api.removeStockFromWatchlist(target._id, symUpper);
      } catch (e) {
        console.warn('Remove stock error', e.message);
        fetchWatchlists(true, target._id);
      }
    } else {
      // Optimistically add
      setWatchlists(prev => prev.map(w => {
        if (w._id === target._id) {
          return { ...w, stocks: [...(w.stocks || []), symUpper] };
        }
        return w;
      }));
      try {
        await api.addStockToWatchlist(target._id, symUpper);
        // Automatically redirect user to Watchlist screen & refresh
        setSearchQuery('');
        Keyboard.dismiss();
        setSelectedId(target._id);
        await fetchWatchlists(true, target._id);
      } catch (e) {
        console.warn('Add stock error', e.message);
        Alert.alert('Watchlist', e.message || 'Failed to add script to watchlist');
        fetchWatchlists(true, target._id);
      }
    }
  };

  // Direct remove stock from watchlist main view
  const handleRemoveStock = useCallback(async (symbol) => {
    if (!activeWatchlist) return;
    const symUpper = symbol.toUpperCase();
    
    // Optimistic removal
    setWatchlists(prev => prev.map(w => {
      if (w._id === activeWatchlist._id) {
        return { ...w, stocks: (w.stocks || []).filter(s => s !== symUpper) };
      }
      return w;
    }));

    try {
      await api.removeStockFromWatchlist(activeWatchlist._id, symUpper);
    } catch (e) {
      console.warn('Remove error', e.message);
      Alert.alert('Error', e.message || 'Failed to remove script');
      fetchWatchlists(true, activeWatchlist._id);
    }
  }, [activeWatchlist, fetchWatchlists]);

  const handleCreateWatchlist = () => {
    setNewListName(`Watchlist ${watchlists.length + 1}`);
    setCreateModalVisible(true);
  };

  const submitCreateWatchlist = async () => {
    const name = newListName.trim();
    if (!name) return;
    try {
      setCreateModalVisible(false);
      setNewListName('');
      
      const newList = await api.createWatchlist(name);
      if (newList?._id) {
        // 1. Immediately switch selection to the newly created watchlist!
        setSelectedId(newList._id);
        
        // 2. Add to local state immediately
        setWatchlists(prev => {
          const filtered = prev.filter(w => w._id !== newList._id);
          return [...filtered, newList];
        });

        // 3. Scroll tabs bar to the end so user sees the newly created tab
        setTimeout(() => {
          tabsScrollRef.current?.scrollToEnd({ animated: true });
        }, 150);
      }
      
      // 4. Fetch fresh from server and keep new list selected
      await fetchWatchlists(true, newList?._id);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to create watchlist');
    }
  };

  const handleDeleteWatchlist = (id, name) => {
    if (watchlists.length <= 1) {
      Alert.alert('Default Watchlist', 'You must have at least one watchlist. Create another watchlist first if you wish to delete this one.');
      return;
    }
    Alert.alert(
      'Delete Watchlist',
      `Are you sure you want to delete "${name || 'this watchlist'}" and all its scripts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic update
            const remaining = watchlists.filter(w => w._id !== id);
            setWatchlists(remaining);
            if (remaining.length > 0) {
              setSelectedId(remaining[0]._id);
            }
            try {
              await api.deleteWatchlist(id);
              await fetchWatchlists(true, remaining[0]?._id);
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to delete watchlist');
              fetchWatchlists(true);
            }
          }
        }
      ]
    );
  };

  const openOrderSheet = useCallback((symbol) => {
    const p = marketStore.getPrice(symbol) || livePrices[symbol] || { ltp: 0 };
    setSheetInstrument({
      underlyingSymbol: symbol,
      strikePrice: null,
      optionType: null,
      expiry: null,
      ltp: p.ltp,
      lotSize: 1,
    });
    setSheetVisible(true);
  }, [livePrices]);

  const handleOrderResult = useCallback(({ success, result, error }) => {
    if (!success) {
      setRejectionReason(typeof error === 'string' ? error : (error?.message || 'Order was rejected'));
      setRejectionOrderInfo(sheetInstrument ? {
        side: 'BUY',
        symbol: sheetInstrument.underlyingSymbol || 'Stock',
        lots: 1,
      } : null);
      setRejectionVisible(true);
    }
  }, [sheetInstrument]);

  const renderWatchItem = useCallback(({ item }) => {
    const sym = typeof item === 'string' ? item : item.symbol;
    const initial = livePrices[sym];
    return (
      <InstrumentRow 
        symbol={sym}
        initialLtp={initial?.ltp}
        initialChange={initial?.change}
        initialChangePercent={initial?.changePercent}
        onPress={openOrderSheet} 
        onRemove={handleRemoveStock}
      />
    );
  }, [openOrderSheet, handleRemoveStock, livePrices]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Watchlist</Text>
        <TouchableOpacity
          style={styles.optionChainPill}
          onPress={() => navigation.navigate('OptionChain', { indexName: 'NIFTY 50' })}
          activeOpacity={0.8}
        >
          <Ionicons name="git-network-outline" size={14} color="#4F46E5" />
          <Text style={styles.optionChainPillText}>Option Chain</Text>
        </TouchableOpacity>
      </View>

      {/* Watchlist Tabs Bar */}
      <View style={styles.tabsWrapper}>
        <ScrollView 
          ref={tabsScrollRef}
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.tabsContainer}
        >
          {watchlists.map((wl) => {
            const isActive = activeWatchlist?._id === wl._id;
            return (
              <TouchableOpacity 
                key={wl._id} 
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setSelectedId(wl._id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{wl.name}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.addTabBtn} onPress={handleCreateWatchlist} activeOpacity={0.7}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.addTabText}>New List</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Active Watchlist Action Subheader */}
      {activeWatchlist && (
        <View style={styles.subHeader}>
          <View style={styles.subHeaderLeft}>
            <Text style={styles.activeListName}>{activeWatchlist.name}</Text>
            <Text style={styles.activeListCount}>
              {activeStocks.length} {activeStocks.length === 1 ? 'script' : 'scripts'}
            </Text>
          </View>
          <View style={styles.subHeaderRight}>
            <TouchableOpacity
              style={styles.deleteWatchlistBtn}
              onPress={() => handleDeleteWatchlist(activeWatchlist._id, activeWatchlist.name)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.loss} />
              <Text style={styles.deleteWatchlistText}>Delete List</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Search Bar with Multi-Add UX */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search stocks to add (e.g. RELIANCE, TCS)..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        {searchQuery.length > 0 && (
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => {
              setSearchQuery('');
              Keyboard.dismiss();
            }}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {searchQuery.length > 0 ? (
          <View style={styles.searchResults}>
            <View style={styles.searchResultHeader}>
              <Text style={styles.searchResultTitle}>Search Results</Text>
              <Text style={styles.searchResultSub}>Tap to add/remove scripts to {activeWatchlist?.name || 'Watchlist'}</Text>
            </View>
            {searching ? (
               <View style={{ padding: 16, gap: 12 }}>
                 {[...Array(4)].map((_, i) => <SkeletonLoader key={i} width="100%" height={60} borderRadius={8} />)}
               </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color={colors.border} />
                <Text style={styles.emptyTitle}>No matching scripts</Text>
                <Text style={styles.emptySub}>Try searching for a different company or symbol.</Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.symbol}
                renderItem={({ item }) => {
                  const symUpper = item.symbol.toUpperCase();
                  const isAdded = activeStocks.includes(symUpper);
                  const live = livePrices[symUpper] || {};
                  return (
                    <View style={styles.searchRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchSymbol}>{item.symbol}</Text>
                        {item.name && <Text style={styles.searchName} numberOfLines={1}>{item.name}</Text>}
                        {live.ltp ? (
                          <Text style={styles.searchLtp}>LTP: {fmt(live.ltp)}</Text>
                        ) : null}
                      </View>
                      
                      {/* Multi-Add Toggle Button */}
                      <TouchableOpacity
                        style={[
                          styles.addScriptToggleBtn,
                          isAdded ? styles.addScriptToggleBtnAdded : styles.addScriptToggleBtnAdd
                        ]}
                        onPress={() => handleToggleStockInSearch(item.symbol)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={isAdded ? "checkmark-circle" : "add"}
                          size={16}
                          color={isAdded ? colors.gain : '#FFFFFF'}
                        />
                        <Text
                          style={[
                            styles.addScriptToggleText,
                            isAdded ? styles.addScriptToggleTextAdded : styles.addScriptToggleTextAdd
                          ]}
                        >
                          {isAdded ? 'Added' : 'Add'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 100 }}
              />
            )}
          </View>
        ) : (
          loading ? (
             <View style={{ padding: 16, gap: 12 }}>
                 {[...Array(6)].map((_, i) => <SkeletonLoader key={i} width="100%" height={72} borderRadius={8} />)}
             </View>
          ) : activeStocks.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="list-outline" size={42} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {activeWatchlist?.name ? `"${activeWatchlist.name}" is empty` : 'No scripts in this watchlist'}
              </Text>
              <Text style={styles.emptySub}>
                Add your favorite stocks and contracts to monitor live market movements and trade quickly.
              </Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => searchInputRef.current?.focus()}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Add Scripts to {activeWatchlist?.name || 'Watchlist'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={activeStocks}
              keyExtractor={(item) => (typeof item === 'string' ? item : item.symbol)}
              renderItem={renderWatchItem}
              getItemLayout={(_, index) => ({ length: 68, offset: 68 * index, index })}
              initialNumToRender={10}
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
          )
        )}
      </View>

      {/* Trade Modal */}
      <OrderBottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onOrderPlaced={handleOrderResult}
        instrument={sheetInstrument}
        defaultSide="BUY"
      />

      <RejectionReasonModal
        visible={rejectionVisible}
        reason={rejectionReason}
        orderInfo={rejectionOrderInfo}
        onClose={() => setRejectionVisible(false)}
      />

      {/* New Watchlist Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCreateModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', maxWidth: 360 }}>
            <Pressable style={styles.modalCard}>
              <Text style={styles.modalTitle}>New Watchlist</Text>
              <Text style={styles.modalSubtitle}>Create a custom watchlist to track your choice of stocks and options:</Text>

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
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setCreateModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalCreateBtn}
                  onPress={submitCreateWatchlist}
                >
                  <Text style={styles.modalCreateText}>Create List</Text>
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
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  optionChainPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  optionChainPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  
  tabsWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center'
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  addTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    gap: 4
  },
  addTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },

  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  subHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeListName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  activeListCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  subHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteWatchlistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  deleteWatchlistText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.loss,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  searchIcon: { position: 'absolute', left: 28, zIndex: 1 },
  searchInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingLeft: 38,
    paddingRight: 36,
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  clearBtn: { position: 'absolute', right: 74, zIndex: 1 },
  doneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  
  content: { flex: 1 },
  
  searchResults: { flex: 1, backgroundColor: '#FFFFFF' },
  searchResultHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchResultTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  searchResultSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  searchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchSymbol: { fontSize: 15, fontWeight: '700', color: colors.text },
  searchName: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  searchLtp: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 3 },
  
  addScriptToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addScriptToggleBtnAdd: {
    backgroundColor: colors.primary,
  },
  addScriptToggleBtnAdded: {
    backgroundColor: 'rgba(38, 166, 154, 0.12)',
    borderWidth: 1,
    borderColor: colors.gain,
  },
  addScriptToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  addScriptToggleTextAdd: {
    color: '#FFFFFF',
  },
  addScriptToggleTextAdded: {
    color: colors.gain,
  },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(26, 115, 232, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  cardLeft: { flex: 1 },
  symbolText: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 3 },
  companyText: { fontSize: 12, color: colors.textSecondary },
  
  cardRight: { alignItems: 'flex-end', marginRight: 14 },
  priceText: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  changeText: { fontSize: 12, fontWeight: '600' },
  
  removeBtn: { padding: 6 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 18, lineHeight: 18 },
  modalInput: {
    height: 48,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  modalCreateBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCreateText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
