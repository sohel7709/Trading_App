import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { USER } from './AccountScreen';

// Kite Connect apps authorized against this account. "You" is the personal
// API app every Kite account gets by default; the rest are well-known
// third-party Kite Connect partners (public app names, not sensitive data).
const APPS = [
  { id: 'self',      name: USER.name,  desc: 'algo test', icon: 'cube-outline', bg: '#F3F4F6', iconColor: '#4B5563', outline: true },
  { id: 'quicko',    name: 'Quicko',   desc: 'Quicko.com is an online tax planning,', letter: 'Q', bg: '#1A73E8' },
  { id: 'streak',    name: 'Streak',   desc: '',                                       icon: 'flash', bg: '#387ED1' },
  { id: 'sensibull', name: 'Sensibull',desc: "Sensibull is India's First Options Trading", icon: 'checkmark-sharp', bg: '#E85D34', square: true },
  { id: 'streaknew', name: 'Streak New', desc: 'Streak Version Update',                icon: 'flash', bg: '#2F6FE0' },
];

function AppIcon({ app }) {
  if (app.outline) {
    return (
      <View style={[styles.iconWrap, { backgroundColor: app.bg, borderWidth: 1, borderColor: '#D1D5DB' }]}>
        <Ionicons name={app.icon} size={22} color={app.iconColor} />
      </View>
    );
  }
  if (app.letter) {
    return (
      <View style={[styles.iconWrap, styles.iconCircle, { backgroundColor: '#fff', borderWidth: 2, borderColor: app.bg }]}>
        <Text style={[styles.iconLetter, { color: app.bg }]}>{app.letter}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.iconWrap, app.square ? styles.iconSquare : null, { backgroundColor: app.bg }]}>
      <Ionicons name={app.icon} size={20} color="#fff" />
    </View>
  );
}

export default function ConnectedAppsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return APPS;
    return APPS.filter(a => a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q));
  }, [query]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connected apps</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9AA4AB" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search apps"
            placeholderTextColor="#9AA4AB"
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={a => a.id}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} activeOpacity={0.6}>
            <AppIcon app={item} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              {!!item.desc && <Text style={styles.rowDesc} numberOfLines={1}>{item.desc}</Text>}
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTxt}>No apps match "{query}"</Text>
          </View>
        }
      />

      {/* FAB — matches the index quick-access button used elsewhere in the app */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => navigation.navigate('IndexChart', { indexName: 'NIFTY 50' })}
      >
        <Ionicons name="trending-up" size={18} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.text },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 16 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 16, height: 50,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },

  list: { flex: 1, backgroundColor: '#fff' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  separator: { height: 1, backgroundColor: '#F0F0F0', marginLeft: 16 + 44 + 14 },

  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  iconCircle: { borderRadius: 22 },
  iconSquare: { borderRadius: 12 },
  iconLetter: { fontSize: 18, fontWeight: '800' },

  rowName: { fontSize: 16, fontWeight: '500', color: colors.text },
  rowDesc: { fontSize: 13, color: '#9AA4AB', marginTop: 3 },

  empty: { padding: 40, alignItems: 'center' },
  emptyTxt: { fontSize: 14, color: '#9AA4AB' },

  fab: {
    position: 'absolute', right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E8E8',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
});
