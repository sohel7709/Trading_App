import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, ScrollView, Animated,
} from 'react-native';
import { useSwipeTabs } from '../hooks/useSwipeTabs';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';
import IndexTicker from '../components/IndexTicker';

const TABS = ['All Stocks', 'Top Gainers', 'Top Losers', '52W High', '52W Low'];

export default function MarketsScreen({ navigation }) {
  const [allStocks, setAllStocks] = useState([]);
  const [prices, setPrices] = useState({});
  const [indexes, setIndexes] = useState({});
  const [movers, setMovers] = useState({ gainers: [], losers: [], mostActive: [] });
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pricesLoaded, setPricesLoaded] = useState(false);

  const { panHandlers, contentAnim } = useSwipeTabs({
    tabCount: TABS.length,
    tab,
    onTabChange: setTab,
  });

  const fetchData = async () => {
    try {
      const [stocks, market, idxRes, moversRes] = await Promise.all([
        api.getAllStocks(),
        api.getLiveMarket(),
        api.getIndexes(),
        api.getMovers(),
      ]);
      setAllStocks(stocks);
      const p = market.prices || {};
      setPrices(p);
      if (Object.keys(p).length > 0) setPricesLoaded(true);
      setIndexes(idxRes.indexes || {});
      setMovers(moversRes || { gainers: [], losers: [], mostActive: [] });
    } catch (e) { console.warn(e.message); }
    finally { setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  useEffect(() => {
    const socket = getSocket();
    socket.on('marketData', (data) => {
      if (data.prices) {
        setPrices(data.prices);
        if (Object.keys(data.prices).length > 0) setPricesLoaded(true);
      }
      if (data.indexes) setIndexes(data.indexes);
      if (data.movers) setMovers(data.movers);
    });
    return () => socket.off('marketData');
  }, []);

  const enriched = allStocks.map((s) => {
    const p = prices[s.symbol] || {};
    return { ...s, ltp: p.ltp ?? p.price ?? 0, change: p.change ?? 0, changePercent: p.changePercent ?? 0, high52w: p.high52w, low52w: p.low52w };
  });

  const filtered = enriched.filter(s =>
    s.symbol.includes(search.toUpperCase()) || s.name.toUpperCase().includes(search.toUpperCase())
  );

  // Enrich mover items with full stock info
  const enrichMover = (m) => {
    const stockInfo = allStocks.find(s => s.symbol === m.symbol) || {};
    return {
      ...stockInfo,
      symbol: m.symbol,
      name: stockInfo.name || m.symbol,
      sector: stockInfo.sector || '',
      ltp: m.ltp ?? 0,
      change: m.change ?? 0,
      changePercent: m.changePercent ?? 0,
      high52w: m.high52w,
      low52w: m.low52w,
    };
  };

  const getTabData = () => {
    const q = search.toUpperCase();
    const searchFilter = (s) =>
      !q || s.symbol?.includes(q) || s.name?.toUpperCase().includes(q);

    if (tab === 1) {
      // Top Gainers — use backend movers.gainers (pre-sorted real data)
      const base = movers.gainers?.length > 0
        ? movers.gainers.map(enrichMover)
        : pricesLoaded ? [...enriched].sort((a, b) => b.changePercent - a.changePercent).filter(s => s.changePercent > 0) : [];
      return base.filter(searchFilter).slice(0, 20);
    }
    if (tab === 2) {
      // Top Losers — use backend movers.losers
      const base = movers.losers?.length > 0
        ? movers.losers.map(enrichMover)
        : pricesLoaded ? [...enriched].sort((a, b) => a.changePercent - b.changePercent).filter(s => s.changePercent < 0) : [];
      return base.filter(searchFilter).slice(0, 20);
    }
    if (tab === 3) {
      // 52W High — stocks within 2% of their 52-week high
      const withH = enriched.filter(s => s.high52w && s.ltp >= s.high52w * 0.97 && s.ltp > 0);
      return (withH.length ? withH : pricesLoaded ? enriched.filter(s => s.ltp > 0) : [])
        .filter(searchFilter).slice(0, 20);
    }
    if (tab === 4) {
      // 52W Low — stocks within 2% of their 52-week low
      const withL = enriched.filter(s => s.low52w && s.ltp <= s.low52w * 1.03 && s.ltp > 0);
      return (withL.length ? withL : pricesLoaded ? enriched.filter(s => s.ltp > 0) : [])
        .filter(searchFilter).slice(0, 20);
    }
    return filtered;
  };

  const isLoadingCategory = !pricesLoaded && tab > 0;

  const data = getTabData();

  const renderStock = ({ item }) => {
    const isGain = item.change >= 0;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('StockDetail', { symbol: item.symbol, ltp: item.ltp, change: item.change, changePercent: item.changePercent })}>
        <View style={styles.left}>
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{item.symbol.substring(0, 2)}</Text>
          </View>
          <View>
            <Text style={styles.symbol}>{item.symbol}</Text>
            <Text style={styles.sector}>{item.sector}</Text>
          </View>
        </View>
        <View style={styles.right}>
          <Text style={styles.ltp}>₹{Number(item.ltp).toFixed(2)}</Text>
          <Text style={[styles.change, { color: isGain ? colors.gain : colors.loss }]}>
            {isGain ? '▲' : '▼'} {Math.abs(Number(item.changePercent)).toFixed(2)}%
          </Text>
        </View>
        <View style={styles.btns}>
          <TouchableOpacity style={[styles.btn, styles.buyBtn]} onPress={() => navigation.navigate('OrderEntry', { symbol: item.symbol, ltp: item.ltp, defaultSide: 'BUY' })}>
            <Text style={styles.btnTxt}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.sellBtn]} onPress={() => navigation.navigate('OrderEntry', { symbol: item.symbol, ltp: item.ltp, defaultSide: 'SELL' })}>
            <Text style={styles.btnTxt}>S</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Markets</Text>
      </View>

      <IndexTicker indexes={indexes} onIndexPress={(name) => navigation.navigate('IndexChart', { indexName: name })} />

      {/* Indices quick-access */}
      <View style={styles.indexSection}>
        <View style={styles.indexSectionHeader}>
          <Text style={styles.indexSectionTitle}>Indices</Text>
          <TouchableOpacity onPress={() => navigation.navigate('IndexChart', { indexName: 'NIFTY 50' })}>
            <Text style={styles.indexSectionLink}>View All →</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.indexCards}>
          {[
            { name: 'NIFTY 50', key: 'NIFTY 50', short: 'NIFTY' },
            { name: 'BANK NIFTY', key: 'BANK NIFTY', short: 'BANKNIFTY' },
            { name: 'SENSEX', key: 'SENSEX', short: 'SENSEX' },
            { name: 'FINNIFTY', key: 'FINNIFTY', short: 'FINNIFTY' },
          ].map((idx) => {
            const d = indexes[idx.key] || {};
            const isUp = (d.change ?? 0) >= 0;
            return (
              <View key={idx.key} style={styles.indexCard}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('IndexChart', { indexName: idx.key })}
                  activeOpacity={0.8}
                  style={styles.indexCardTop}
                >
                  <Text style={styles.indexCardName}>{idx.short}</Text>
                  <Text style={[styles.indexCardPrice, { color: isUp ? colors.gain : colors.loss }]}>
                    {d.ltp ? Number(d.ltp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                  </Text>
                  <Text style={[styles.indexCardChange, { color: isUp ? colors.gain : colors.loss }]}>
                    {isUp ? '▲' : '▼'} {Math.abs(Number(d.changePercent ?? 0)).toFixed(2)}%
                  </Text>
                </TouchableOpacity>
                <View style={styles.indexCardBtns}>
                  <TouchableOpacity
                    style={styles.indexBtnChart}
                    onPress={() => navigation.navigate('IndexChart', { indexName: idx.key })}
                  >
                    <Ionicons name="bar-chart-outline" size={12} color={colors.primary} />
                    <Text style={styles.indexBtnChartTxt}>Chart</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.indexBtnOC}
                    onPress={() => navigation.navigate('OptionChain', { indexName: idx.key })}
                  >
                    <Text style={styles.indexBtnOCTxt}>Option Chain</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search stocks..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center' }}>
        {TABS.map((t, i) => (
          <TouchableOpacity key={t} style={[styles.tabPill, tab === i && styles.tabPillActive]} onPress={() => setTab(i)}>
            <Text style={[styles.tabText, tab === i && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Animated.View style={{ flex: 1, opacity: contentAnim }} {...panHandlers}>
        {isLoadingCategory ? (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>Loading live prices…</Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item, i) => item.symbol ?? String(i)}
            renderItem={renderStock}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Text style={styles.listHeaderTxt}>
                  {tab === 0 ? 'ALL STOCKS' : tab === 1 ? `TOP GAINERS (${data.length})` : tab === 2 ? `TOP LOSERS (${data.length})` : tab === 3 ? '52W HIGH' : '52W LOW'}
                </Text>
                <Text style={styles.listHeaderTxt}>LTP / CHANGE</Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyCategory}>
                <Ionicons name="bar-chart-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyCategoryText}>
                  {tab === 1 ? 'No gainers right now' : tab === 2 ? 'No losers right now' : 'No data available'}
                </Text>
              </View>
            }
          />
        )}
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 14, color: colors.text },
  tabRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 },
  tabPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginRight: 8, backgroundColor: colors.surface },
  tabPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  listHeaderTxt: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
  loadingBox: { flex: 1, alignItems: 'center', paddingTop: 60 },
  loadingText: { fontSize: 13, color: colors.textMuted },
  emptyCategory: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyCategoryText: { fontSize: 13, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: colors.primary },
  symbol: { fontSize: 13, fontWeight: '700', color: colors.text },
  sector: { fontSize: 11, color: colors.textMuted },
  right: { alignItems: 'flex-end', marginRight: 10 },
  ltp: { fontSize: 13, fontWeight: '700', color: colors.text },
  change: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  btns: { flexDirection: 'row', gap: 5 },
  btn: { width: 26, height: 26, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  buyBtn: { backgroundColor: colors.buyGreen },
  sellBtn: { backgroundColor: colors.sellRed },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 11 },

  indexSection: {
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingTop: 10, paddingBottom: 8,
  },
  indexSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, marginBottom: 8,
  },
  indexSectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5 },
  indexSectionLink: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  indexCards: { paddingHorizontal: 14, gap: 10 },
  indexCard: {
    width: 152,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, overflow: 'hidden',
  },
  indexCardTop: { padding: 12, paddingBottom: 8 },
  indexCardName: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 3 },
  indexCardPrice: { fontSize: 15, fontWeight: '800', marginBottom: 1 },
  indexCardChange: { fontSize: 11, fontWeight: '600' },
  indexCardBtns: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border },
  indexBtnChart: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, paddingVertical: 7,
    borderRightWidth: 1, borderRightColor: colors.border,
  },
  indexBtnChartTxt: { fontSize: 11, fontWeight: '700', color: colors.primary },
  indexBtnOC: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 7, backgroundColor: colors.primary,
  },
  indexBtnOCTxt: { fontSize: 10, fontWeight: '700', color: '#fff' },
});
