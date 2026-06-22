import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import IndexTicker from '../components/IndexTicker';

const TABS       = ['Active', 'Triggered', 'All'];
const CONDITIONS = ['ABOVE', 'BELOW'];

// ─── Alert row ────────────────────────────────────────────────────────────────
function AlertRow({ item, onDelete }) {
  const isAbove = item.condition === 'ABOVE';
  const condColor = isAbove ? colors.gain : colors.loss;

  return (
    <View style={styles.alertRow}>
      {/* Left: direction icon */}
      <View style={[styles.dirIcon, { backgroundColor: isAbove ? colors.gainLight : colors.lossLight }]}>
        <Ionicons
          name={isAbove ? 'arrow-up' : 'arrow-down'}
          size={14}
          color={condColor}
        />
      </View>

      {/* Middle: symbol + condition */}
      <View style={styles.alertMid}>
        <Text style={styles.alertSymbol}>{item.stockSymbol}</Text>
        <Text style={styles.alertCond}>
          <Text style={{ color: condColor, fontWeight: '600' }}>
            {isAbove ? 'ABOVE' : 'BELOW'}
          </Text>
          {'  '}
          <Text style={styles.alertPrice}>
            ₹{Number(item.targetPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </Text>
        </Text>
      </View>

      {/* Right: triggered badge + delete */}
      <View style={styles.alertRight}>
        {item.triggered && (
          <View style={styles.triggeredBadge}>
            <Text style={styles.triggeredText}>Triggered</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(item._id, item.stockSymbol)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function AlertsScreen({ navigation }) {
  const [alerts,       setAlerts]       = useState([]);
  const [refreshing,   setRefreshing]   = useState(false);
  const [activeTab,    setActiveTab]    = useState('Active');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [symbol,       setSymbol]       = useState('');
  const [targetPrice,  setTargetPrice]  = useState('');
  const [condition,    setCondition]    = useState('ABOVE');
  const [searchResults, setSearchResults] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const insets = useSafeAreaInsets();

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAlerts = async () => {
    try {
      const data = await api.getAlerts();
      setAlerts(data || []);
    } catch (e) { console.warn(e.message); }
    finally { setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchAlerts(); }, []));

  // ── Search ─────────────────────────────────────────────────────────────────
  const searchStock = async (q) => {
    setSymbol(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const res = await api.searchStocks(q);
      setSearchResults((res || []).slice(0, 6));
    } catch {}
  };

  // ── Create ─────────────────────────────────────────────────────────────────
  const createAlert = async () => {
    if (!symbol || !targetPrice) {
      return Alert.alert('Required', 'Enter symbol and target price');
    }
    setLoading(true);
    try {
      await api.createAlert({ stockSymbol: symbol, targetPrice: Number(targetPrice), condition });
      setSheetVisible(false);
      setSymbol(''); setTargetPrice(''); setCondition('ABOVE'); setSearchResults([]);
      fetchAlerts();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteAlert = (id, sym) => {
    Alert.alert('Delete alert', `Delete alert for ${sym}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await api.deleteAlert(id); fetchAlerts(); },
      },
    ]);
  };

  // ── Tab filtering ──────────────────────────────────────────────────────────
  const displayed = alerts.filter(a => {
    if (activeTab === 'All')       return true;
    if (activeTab === 'Triggered') return !!a.triggered;
    return !a.triggered; // Active
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alerts</Text>
        <TouchableOpacity style={styles.headerAdd} onPress={() => setSheetVisible(true)}>
          <Text style={styles.headerAddText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* ── Index ticker ───────────────────────────────────────────────────── */}
      <IndexTicker navigation={navigation} />

      {/* ── Segmented tabs: Active | Triggered | All ─────────────────────── */}
      <View style={styles.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && styles.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Alerts list ────────────────────────────────────────────────────── */}
      <FlatList
        data={displayed}
        keyExtractor={(item, i) => item._id ?? String(i)}
        renderItem={({ item }) => <AlertRow item={item} onDelete={deleteAlert} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAlerts(); }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={52} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No alerts</Text>
            <Text style={styles.emptyText}>
              Set price alerts to be notified when stocks hit your target price.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setSheetVisible(true)}>
              <Text style={styles.emptyBtnText}>Create alert</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* ── Create alert bottom sheet ───────────────────────────────────────── */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setSheetVisible(false); setSearchResults([]); }}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.overlayBg}
            onPress={() => { setSheetVisible(false); setSearchResults([]); }}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Create alert</Text>
              <TouchableOpacity onPress={() => { setSheetVisible(false); setSearchResults([]); }}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Instrument search */}
            <Text style={styles.fieldLabel}>Instrument</Text>
            <View style={styles.inputRow}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.inputFlex}
                placeholder="Search e.g. INFY, NIFTY 50"
                placeholderTextColor={colors.textMuted}
                value={symbol}
                onChangeText={searchStock}
                autoCapitalize="characters"
              />
            </View>
            {searchResults.length > 0 && (
              <View style={styles.suggestions}>
                {searchResults.map(s => (
                  <TouchableOpacity
                    key={s.symbol}
                    style={styles.suggestion}
                    onPress={() => { setSymbol(s.symbol); setSearchResults([]); }}
                  >
                    <Text style={styles.suggSymbol}>{s.symbol}</Text>
                    <Text style={styles.suggName} numberOfLines={1}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Condition toggle */}
            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Condition</Text>
            <View style={styles.condRow}>
              {CONDITIONS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.condBtn, condition === c && styles.condBtnActive]}
                  onPress={() => setCondition(c)}
                >
                  <Ionicons
                    name={c === 'ABOVE' ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color={condition === c ? '#fff' : colors.textSecondary}
                  />
                  <Text style={[styles.condBtnText, condition === c && styles.condBtnTextActive]}>
                    {c === 'ABOVE' ? 'Goes above' : 'Goes below'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Target price */}
            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Target price (₹)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              value={targetPrice}
              onChangeText={setTargetPrice}
            />

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!symbol || !targetPrice) && styles.submitBtnDisabled,
              ]}
              onPress={createAlert}
              disabled={loading || !symbol || !targetPrice}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>Set alert</Text>
              }
            </TouchableOpacity>

            <View style={{ height: 24 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBack:    { padding: 4, marginRight: 8 },
  headerTitle:   { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  headerAdd:     { padding: 4 },
  headerAddText: { fontSize: 24, fontWeight: '400', color: colors.primary, lineHeight: 26 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: colors.primary },
  tabText:       { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },

  // List
  listContent: { paddingBottom: 80 },

  // Alert row
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 54,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 12,
  },
  dirIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertMid:    { flex: 1 },
  alertSymbol: { fontSize: 14, fontWeight: '700', color: colors.text },
  alertCond:   { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  alertPrice:  { fontSize: 12, color: colors.textSecondary },

  alertRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  triggeredBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: colors.warningLight,
    borderRadius: 4,
  },
  triggeredText: { fontSize: 11, fontWeight: '700', color: colors.warning },
  deleteBtn: { padding: 4 },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 17, fontWeight: '700', color: colors.text,
    marginTop: 16, marginBottom: 8,
  },
  emptyText: {
    fontSize: 13, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Sheet
  overlay:   { flex: 1, justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingTop: 10,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },

  // Form
  fieldLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500', marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  inputFlex: { flex: 1, fontSize: 15, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  suggestions: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggSymbol: { fontSize: 13, fontWeight: '700', color: colors.primary, width: 90 },
  suggName:   { flex: 1, fontSize: 12, color: colors.textSecondary },

  // Condition toggle
  condRow: { flexDirection: 'row', gap: 8 },
  condBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
  },
  condBtnActive:   { backgroundColor: colors.primary, borderColor: colors.primary },
  condBtnText:     { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  condBtnTextActive: { color: '#fff' },

  // Submit
  submitBtn: {
    marginTop: 24,
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#9CA3AF' },
  submitBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});
