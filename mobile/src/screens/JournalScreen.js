/**
 * JournalScreen.js
 * ─────────────────
 * Trade journal — students annotate closed trades with:
 *   - Free-form notes
 *   - Emotion tag (Fear, Greed, Calm, FOMO, Confident, Anxious)
 *   - Mistake tags (No SL, FOMO entry, Overleveraged, Revenge trade, etc.)
 *
 * API:
 *   GET  /journal          → list all journal entries
 *   POST /journal          → create / update entry for a trade
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, RefreshControl, StatusBar, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { api } from '../api/client';

// ── Constants ─────────────────────────────────────────────────────────────────
const EMOTIONS = [
  { key: 'CALM',       label: '😌 Calm',       color: '#10b981' },
  { key: 'CONFIDENT',  label: '💪 Confident',  color: '#1A73E8' },
  { key: 'FEAR',       label: '😨 Fear',        color: '#f59e0b' },
  { key: 'GREED',      label: '🤑 Greed',       color: '#ef4444' },
  { key: 'FOMO',       label: '😰 FOMO',        color: '#f97316' },
  { key: 'ANXIOUS',    label: '😟 Anxious',     color: '#8b5cf6' },
];

const MISTAKES = [
  { key: 'NO_SL',          label: 'No Stop-Loss' },
  { key: 'FOMO_ENTRY',     label: 'FOMO Entry' },
  { key: 'OVERLEVERAGED',  label: 'Overleveraged' },
  { key: 'REVENGE_TRADE',  label: 'Revenge Trade' },
  { key: 'OVERTRADING',    label: 'Overtrading' },
  { key: 'IGNORED_RULES',  label: 'Ignored Risk Rules' },
  { key: 'PREMATURE_EXIT', label: 'Premature Exit' },
  { key: 'HELD_TOO_LONG',  label: 'Held Too Long' },
];

// ── Trade selector chip ───────────────────────────────────────────────────────
function TradeChip({ trade, selected, onPress }) {
  const pnl = trade.realisedPnl || 0;
  return (
    <TouchableOpacity
      style={[styles.tradeChip, selected && styles.tradeChipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.tradeChipSymbol, selected && styles.tradeChipSymbolActive]} numberOfLines={1}>
        {trade.symbol || trade.stockSymbol}
      </Text>
      <Text style={[styles.tradeChipPnl, { color: pnl >= 0 ? colors.gain : colors.loss }]}>
        {pnl >= 0 ? '+' : ''}₹{Math.abs(pnl).toFixed(0)}
      </Text>
    </TouchableOpacity>
  );
}

// ── Journal entry card ────────────────────────────────────────────────────────
function JournalCard({ entry }) {
  const emotionObj = EMOTIONS.find((e) => e.key === entry.emotion);
  return (
    <View style={styles.journalCard}>
      <View style={styles.journalCardHeader}>
        <Text style={styles.journalCardSymbol}>{entry.symbol || entry.stockSymbol}</Text>
        {emotionObj && (
          <View style={[styles.emotionBadge, { backgroundColor: emotionObj.color + '1A' }]}>
            <Text style={[styles.emotionBadgeText, { color: emotionObj.color }]}>
              {emotionObj.label}
            </Text>
          </View>
        )}
      </View>
      {entry.notes ? (
        <Text style={styles.journalCardNote}>{entry.notes}</Text>
      ) : null}
      {entry.mistakes?.length > 0 && (
        <View style={styles.mistakeList}>
          {entry.mistakes.map((m) => {
            const obj = MISTAKES.find((x) => x.key === m);
            return (
              <View key={m} style={styles.mistakeTag}>
                <Text style={styles.mistakeTagText}>{obj?.label || m}</Text>
              </View>
            );
          })}
        </View>
      )}
      <Text style={styles.journalCardDate}>
        {new Date(entry.createdAt || entry.updatedAt).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        })}
      </Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function JournalScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [view, setView]               = useState('list'); // 'list' | 'compose'
  const [journals, setJournals]       = useState([]);
  const [trades, setTrades]           = useState([]);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [notes, setNotes]             = useState('');
  const [selectedEmotion, setEmotion] = useState(null);
  const [selectedMistakes, setMistakes] = useState([]);
  const [saving, setSaving]           = useState(false);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  // ── Data ───────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [j, t] = await Promise.all([
        api.get ? api.get('/journal') : fetch('/journal').then(r => r.json()).catch(() => []),
        api.getTrades(),
      ]);
      setJournals(Array.isArray(j) ? j : []);
      setTrades(Array.isArray(t) ? t : []);
    } catch (e) {
      console.warn('Journal fetch:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  // ── Save ───────────────────────────────────────────────────────────────
  const saveJournal = async () => {
    if (!selectedTrade) return Alert.alert('Select a trade first');
    setSaving(true);
    try {
      await fetch(`${require('../api/client').BASE_URL}/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeId: selectedTrade._id,
          symbol: selectedTrade.stockSymbol,
          notes,
          emotion: selectedEmotion,
          mistakes: selectedMistakes,
        }),
      });
      setView('list');
      setSelectedTrade(null);
      setNotes('');
      setEmotion(null);
      setMistakes([]);
      fetchData();
    } catch (e) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleMistake = (key) => {
    setMistakes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Trade Journal</Text>
          <Text style={styles.headerSub}>{journals.length} entries</Text>
        </View>
        <TouchableOpacity
          style={[styles.composeBtn, view === 'compose' && styles.composeBtnActive]}
          onPress={() => setView(view === 'list' ? 'compose' : 'list')}
          activeOpacity={0.85}
        >
          <Ionicons
            name={view === 'compose' ? 'close' : 'add'}
            size={20}
            color={view === 'compose' ? colors.textSecondary : '#fff'}
          />
        </TouchableOpacity>
      </View>

      {view === 'compose' ? (
        // ── Compose form ────────────────────────────────────────────
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Trade selector */}
          <Text style={styles.sectionLabel}>SELECT TRADE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tradeList}>
            {trades.slice(0, 20).map((t) => (
              <TradeChip
                key={t._id}
                trade={t}
                selected={selectedTrade?._id === t._id}
                onPress={() => setSelectedTrade(t)}
              />
            ))}
          </ScrollView>

          {/* Emotion */}
          <Text style={styles.sectionLabel}>HOW DID YOU FEEL?</Text>
          <View style={styles.emotionGrid}>
            {EMOTIONS.map((e) => (
              <TouchableOpacity
                key={e.key}
                style={[
                  styles.emotionChip,
                  selectedEmotion === e.key && { backgroundColor: e.color, borderColor: e.color },
                ]}
                onPress={() => setEmotion(selectedEmotion === e.key ? null : e.key)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.emotionChipText,
                  selectedEmotion === e.key && { color: '#fff' },
                ]}>
                  {e.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Mistakes */}
          <Text style={styles.sectionLabel}>MISTAKES MADE</Text>
          <View style={styles.mistakeGrid}>
            {MISTAKES.map((m) => {
              const active = selectedMistakes.includes(m.key);
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.mistakeChip, active && styles.mistakeChipActive]}
                  onPress={() => toggleMistake(m.key)}
                  activeOpacity={0.8}
                >
                  {active && <Ionicons name="checkmark" size={12} color={colors.loss} style={{ marginRight: 4 }} />}
                  <Text style={[styles.mistakeChipText, active && styles.mistakeChipTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Notes */}
          <Text style={styles.sectionLabel}>NOTES & OBSERVATIONS</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="What went right? What would you do differently next time?"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, (!selectedTrade || saving) && styles.saveBtnDisabled]}
            onPress={saveJournal}
            disabled={!selectedTrade || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Journal Entry</Text>
                </>
            }
          </TouchableOpacity>
        </ScrollView>
      ) : (
        // ── Entry list ──────────────────────────────────────────────
        loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.listContent,
              journals.length === 0 && styles.emptyContainer,
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchData(); }}
                colors={[colors.primary]} />
            }
          >
            {journals.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={56} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No journal entries yet</Text>
                <Text style={styles.emptySubtitle}>
                  Tap + to annotate your first trade. Journaling is how professionals improve.
                </Text>
              </View>
            ) : (
              journals.map((j) => <JournalCard key={j._id} entry={j} />)
            )}
          </ScrollView>
        )
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  composeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  composeBtnActive: { backgroundColor: colors.surfaceLight },

  form: { paddingHorizontal: 20, paddingBottom: 60 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.8, marginBottom: 10, marginTop: 20,
  },

  tradeList: { marginBottom: 4 },
  tradeChip: {
    marginRight: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  tradeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tradeChipSymbol: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 2 },
  tradeChipSymbolActive: { color: '#fff' },
  tradeChipPnl: { fontSize: 11, fontWeight: '600' },

  emotionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emotionChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24,
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff',
  },
  emotionChipText: { fontSize: 13, fontWeight: '600', color: colors.text },

  mistakeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mistakeChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border,
  },
  mistakeChipActive: { backgroundColor: '#fef2f2', borderColor: colors.loss },
  mistakeChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  mistakeChipTextActive: { color: colors.loss },

  notesInput: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 14, color: colors.text, lineHeight: 22, minHeight: 140,
    marginBottom: 8,
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: colors.primary, borderRadius: 16,
    paddingVertical: 18, marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  listContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  emptyContainer: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 16 },
  emptySubtitle: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center',
    marginTop: 8, paddingHorizontal: 40, lineHeight: 22,
  },

  journalCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  journalCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  journalCardSymbol: { fontSize: 15, fontWeight: '700', color: colors.text },
  emotionBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  emotionBadgeText: { fontSize: 12, fontWeight: '700' },
  journalCardNote: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: 10 },
  mistakeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  mistakeTag: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
  mistakeTagText: { fontSize: 11, fontWeight: '600', color: colors.loss },
  journalCardDate: { fontSize: 11, color: colors.textMuted },
});
