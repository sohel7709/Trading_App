import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';

// ─── Helper: format INR with commas ─────────────────────────────────────────
const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Single breakdown row ────────────────────────────────────────────────────
function Row({ label, value, valueBold, valueColor, last }) {
  return (
    <View style={[styles.breakRow, last && styles.breakRowLast]}>
      <Text style={styles.breakLabel}>{label}</Text>
      <Text style={[
        styles.breakValue,
        valueBold && styles.breakValueBold,
        valueColor ? { color: valueColor } : null,
      ]}>
        ₹{fmt(value)}
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function FundsScreen({ navigation }) {
  const [wallet, setWallet] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  const fetchData = async () => {
    try {
      const w = await api.getWallet();
      setWallet(w);
    } catch (e) { console.warn(e.message); }
    finally { setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  // Auto-load on socket connect + live update on orders
  useEffect(() => {
    const socket = getSocket();
    const onInitialData = (data) => { if (data.wallet) setWallet(data.wallet); };
    const onOrderExecuted = (data) => { if (data.wallet) setWallet(data.wallet); };
    socket.on('initialData', onInitialData);
    socket.on('orderExecuted', onOrderExecuted);
    return () => {
      socket.off('initialData', onInitialData);
      socket.off('orderExecuted', onOrderExecuted);
    };
  }, []);

  const available = Number(wallet?.availableMargin ?? 0);
  const used      = Number(wallet?.usedMargin ?? 0);
  const balance   = Number(wallet?.balance ?? 0);
  const total     = available + used;
  const usedRatio = total > 0 ? Math.min(used / total, 1) : 0;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!wallet) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header skeleton */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Funds</Text>
          <View style={styles.headerRight} />
        </View>
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Funds</Text>
        <TouchableOpacity style={styles.headerRight}>
          <Ionicons name="time-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero card: available margin ──────────────────────────────────── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Available margin</Text>
          <Text style={styles.heroSubLabel}>Cash + Collateral</Text>
          <Text style={styles.heroAmount}>₹{fmt(available)}</Text>

          {/* Usage bar */}
          <View style={styles.usageTrack}>
            <View style={[styles.usageFill, { flex: usedRatio }]} />
            <View style={{ flex: 1 - usedRatio }} />
          </View>
          <View style={styles.usageLegend}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Used  ₹{fmt(used)}</Text>
            <View style={[styles.legendDot, { backgroundColor: '#E8E8E8', marginLeft: 14 }]} />
            <Text style={styles.legendText}>Available  ₹{fmt(available)}</Text>
          </View>
        </View>

        {/* ── Breakdown card ──────────────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>EQUITY</Text>

          <Row label="Equity available"  value={available} />
          <Row label="Used margin"        value={used}      valueColor={colors.loss} />
          <Row label="Opening balance"    value={balance} />
          <Row label="Payin"              value={0} />
          <Row label="SPAN margin"        value={0} />
          <Row label="Exposure margin"    value={0} />

          <View style={styles.sectionDivider} />

          <Row
            label="Total balance"
            value={balance}
            valueBold
            last
          />
        </View>

        {/* ── Collateral card ─────────────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>COLLATERAL</Text>
          <Row label="Collateral (Liquid funds)" value={0} />
          <Row label="Collateral (Equity)"       value={0} />
          <View style={styles.sectionDivider} />
          <Row label="Total collateral"          value={0} valueBold last />
        </View>

        {/* ── Action buttons ──────────────────────────────────────────────── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.btnAdd}
            onPress={() => navigation.navigate('AddFunds')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnAddText}>Add funds</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnWithdraw}
            onPress={() => navigation.navigate('Withdraw')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnWithdrawText}>Withdraw</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  headerBack:  { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  headerRight: { padding: 4, marginLeft: 8, width: 30 },

  // Scroll
  scrollContent: { paddingBottom: 40 },

  // Hero card
  heroCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
  },
  heroLabel:    { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  heroSubLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 10 },
  heroAmount:   { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 18 },

  // Usage bar
  usageTrack: {
    flexDirection: 'row',
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8E8E8',
    overflow: 'hidden',
    marginBottom: 10,
  },
  usageFill: { backgroundColor: colors.primary },

  // Legend
  usageLegend: { flexDirection: 'row', alignItems: 'center' },
  legendDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginRight: 4 },
  legendText:  { fontSize: 11, color: colors.textSecondary },

  // Section card
  sectionCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    letterSpacing: 0.5,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
    marginVertical: 4,
  },

  // Breakdown row
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 50,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  breakRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 6,
  },
  breakLabel:     { fontSize: 13, color: colors.textSecondary },
  breakValue:     { fontSize: 13, color: colors.text },
  breakValueBold: { fontSize: 14, fontWeight: '700' },

  // Action row
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 20,
  },
  btnAdd: {
    flex: 1,
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnAddText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnWithdraw: {
    flex: 1,
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnWithdrawText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
});
