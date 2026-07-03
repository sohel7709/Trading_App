import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

const STORAGE_KEY = 'app_settings_v1';

const DEFAULTS = {
  theme: 'Default',
  orderNotifications: false,
  stickyOrderWindow: true,
  accessibilityMode: false,
  fullscreen: false,
  stickyPins: true,
  showWatchlistNotes: true,
};

const TOGGLES = [
  { key: 'orderNotifications', label: 'Order notifications' },
  { key: 'stickyOrderWindow',  label: 'Sticky order window',  desc: "Don't automatically hide order window after order placement." },
  { key: 'accessibilityMode',  label: 'Accessibility mode',   desc: 'Disables transitions and simplifies UI.' },
  { key: 'fullscreen',         label: 'Fullscreen',           desc: 'May not work on certain devices.' },
  { key: 'stickyPins',         label: 'Sticky pins',          desc: 'Show pinned stock tickers on the top on all screens.' },
  { key: 'showWatchlistNotes', label: 'Show watchlist notes' },
];

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => { if (v) setSettings(prev => ({ ...prev, ...JSON.parse(v) })); })
      .catch(() => {});
  }, []);

  const persist = useCallback((next) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const toggle = (key) => persist({ ...settings, [key]: !settings[key] });
  const setTheme = (theme) => persist({ ...settings, theme });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Theme */}
        <Text style={styles.sectionTitle}>Theme</Text>
        {['Default', 'Dark'].map(t => (
          <TouchableOpacity key={t} style={styles.radioRow} onPress={() => setTheme(t)} activeOpacity={0.6}>
            <Text style={styles.radioLabel}>{t}</Text>
            <View style={[styles.radioOuter, settings.theme === t && styles.radioOuterActive]}>
              {settings.theme === t && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.sectionGap} />

        {/* Toggles */}
        {TOGGLES.map(t => (
          <View key={t.key} style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 16 }}>
              <Text style={styles.toggleLabel}>{t.label}</Text>
              {!!t.desc && <Text style={styles.toggleDesc}>{t.desc}</Text>}
            </View>
            <Switch
              value={!!settings[t.key]}
              onValueChange={() => toggle(t.key)}
              trackColor={{ false: '#E5E7EB', true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16,
  },
  headerTitle: { fontSize: 19, fontWeight: '600', color: colors.text },

  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: colors.text,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10,
  },
  sectionGap: { height: 8, backgroundColor: '#F5F5F5', marginTop: 4 },

  radioRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  radioLabel: { fontSize: 15, color: colors.text },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#D1D5DB',
    justifyContent: 'center', alignItems: 'center',
  },
  radioOuterActive: { borderColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  toggleLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },
  toggleDesc: { fontSize: 12, color: '#9AA4AB', marginTop: 4, lineHeight: 16 },
});
