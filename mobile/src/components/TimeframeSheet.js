import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

// TradingView-style timeframe menu. `value` is what the backend candle API
// accepts; `short` is the compact toolbar label.
export const TIMEFRAMES = [
  { section: 'MINUTES', label: '1 minute',   short: '1m',  value: '1m'  },
  { section: 'MINUTES', label: '2 minutes',  short: '2m',  value: '2m'  },
  { section: 'MINUTES', label: '3 minutes',  short: '3m',  value: '3m'  },
  { section: 'MINUTES', label: '4 minutes',  short: '4m',  value: '4m'  },
  { section: 'MINUTES', label: '5 minutes',  short: '5m',  value: '5m'  },
  { section: 'MINUTES', label: '10 minutes', short: '10m', value: '10m' },
  { section: 'MINUTES', label: '15 minutes', short: '15m', value: '15m' },
  { section: 'MINUTES', label: '30 minutes', short: '30m', value: '30m' },
  { section: 'HOURS',   label: '1 hour',     short: '1h',  value: '1h'  },
  { section: 'HOURS',   label: '2 hours',    short: '2h',  value: '2h'  },
  { section: 'HOURS',   label: '3 hours',    short: '3h',  value: '3h'  },
  { section: 'HOURS',   label: '4 hours',    short: '4h',  value: '4h'  },
  { section: 'DAYS',    label: '1 day',      short: '1D',  value: '1d'  },
  { section: 'DAYS',    label: '1 week',     short: '1W',  value: '1w'  },
];

const SECTIONS = ['MINUTES', 'HOURS', 'DAYS'];
const FAVS_KEY = 'chart_timeframe_favs';
const DEFAULT_FAVS = ['1m', '5m', '15m', '1h', '1D'];

// Shared favorites hook — persisted so every chart screen sees the same stars
export function useTimeframeFavorites() {
  const [favorites, setFavorites] = useState(DEFAULT_FAVS);

  useEffect(() => {
    AsyncStorage.getItem(FAVS_KEY)
      .then(v => { if (v) setFavorites(JSON.parse(v)); })
      .catch(() => {});
  }, []);

  const toggleFavorite = useCallback((short) => {
    setFavorites(prev => {
      const next = prev.includes(short)
        ? prev.filter(s => s !== short)
        : [...prev, short];
      AsyncStorage.setItem(FAVS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { favorites, toggleFavorite };
}

// ─── Bottom sheet (mirrors the TradingView interval picker) ──────────────────
export default function TimeframeSheet({ visible, selected, favorites, onSelect, onToggleFav, onClose }) {
  // Reactive window size — see StockDetailScreen.js for why a one-time
  // `Dimensions.get('window')` at module load is the wrong tool here (this
  // sheet's max height needs to actually match the device it's on, not
  // whatever the first device to ever load this bundle happened to report).
  const { height: screenH } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlayWrap}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: screenH * 0.78 }]}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {SECTIONS.map(section => (
              <View key={section}>
                <Text style={styles.sectionHeader}>{section}</Text>
                {TIMEFRAMES.filter(tf => tf.section === section).map(tf => {
                  const isActive = selected === tf.value;
                  const isFav = favorites.includes(tf.short);
                  return (
                    <TouchableOpacity
                      key={tf.short}
                      style={[styles.row, isActive && styles.rowActive]}
                      onPress={() => { onSelect(tf); onClose(); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>
                        {tf.label}
                      </Text>
                      <TouchableOpacity
                        onPress={() => onToggleFav(tf.short)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name={isFav ? 'star' : 'star-outline'}
                          size={22}
                          color={isFav ? '#F59E0B' : isActive ? '#fff' : '#B0B7BC'}
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Top toolbar: current interval + starred quick-switch chips ──────────────
export function ChartToolbar({ selected, favorites, onSelect, onOpenSheet }) {
  const current = TIMEFRAMES.find(tf => tf.value === selected) ?? TIMEFRAMES[0];
  const favTfs = TIMEFRAMES.filter(tf => favorites.includes(tf.short));

  return (
    <View style={styles.toolbar}>
      <TouchableOpacity style={styles.toolbarCurrent} onPress={onOpenSheet} activeOpacity={0.7}>
        <Text style={styles.toolbarCurrentTxt}>{current.short}</Text>
        <Ionicons name="chevron-down" size={12} color="#738390" />
      </TouchableOpacity>
      <View style={styles.toolbarDivider} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarFavs}>
        {favTfs.map(tf => (
          <TouchableOpacity
            key={tf.short}
            style={[styles.favChip, selected === tf.value && styles.favChipActive]}
            onPress={() => onSelect(tf)}
            activeOpacity={0.7}
          >
            <Text style={[styles.favChipTxt, selected === tf.value && styles.favChipTxtActive]}>
              {tf.short}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.toolbarIconBtn} onPress={onOpenSheet} activeOpacity={0.7}>
        <Ionicons name="options-outline" size={18} color="#4B5563" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayWrap: { flex: 1, justifyContent: 'flex-end' },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginBottom: 6,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9AA4AB',
    letterSpacing: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  rowActive: { backgroundColor: '#2F3337' },
  rowLabel: { fontSize: 17, color: '#2A2E33', fontWeight: '400' },
  rowLabelActive: { color: '#fff', fontWeight: '600' },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E8EAED',
    backgroundColor: '#fff',
    height: 40,
    paddingLeft: 4,
  },
  toolbarCurrent: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 10, height: '100%',
  },
  toolbarCurrentTxt: { fontSize: 13, fontWeight: '700', color: '#1E1E1E' },
  toolbarDivider: { width: 1, height: 20, backgroundColor: '#E8EAED' },
  toolbarFavs: { alignItems: 'center', paddingHorizontal: 6, gap: 2 },
  favChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5,
  },
  favChipActive: { backgroundColor: '#EFF6FF' },
  favChipTxt: { fontSize: 12, fontWeight: '600', color: '#738390' },
  favChipTxtActive: { color: '#387ED1', fontWeight: '700' },
  toolbarIconBtn: {
    paddingHorizontal: 12, height: '100%', justifyContent: 'center',
    borderLeftWidth: 1, borderLeftColor: '#E8EAED',
  },
});
