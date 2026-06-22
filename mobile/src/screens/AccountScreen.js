import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import IndexTicker from '../components/IndexTicker';

export const USER = {
  name:      'Ashok Shrikisan Waghmode',
  code:      'TG3140',
  email:     'Ashokwaghmode9@gmail.com',
  initials:  'AW',
  bank:      'Canara Bank',
  bankLast4: '9869',
  phone:     '8652',
  pan:       'ACQPW8465M',
  demat:     '1208160034922852',
  boId:      '34922852',
};

// ─── Menu row: label left, category icon on the right (matches Kite) ──────
const MenuRow = ({ icon, label, onPress, danger, last }) => (
  <TouchableOpacity
    style={[styles.menuItem, last && { borderBottomWidth: 0 }]}
    onPress={onPress}
    activeOpacity={0.6}
  >
    <Text style={[styles.menuLabel, danger && { color: colors.loss }]}>{label}</Text>
    <Ionicons name={icon} size={20} color={danger ? colors.loss : colors.textSecondary} />
  </TouchableOpacity>
);

export default function AccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [privacyMode, setPrivacyMode] = useState(false);
  const [consoleOn, setConsoleOn]     = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  const CONSOLE_LINKS = [
    { label: 'Portfolio',   screen: 'Portfolio' },
    { label: 'Tradebook',   screen: 'Orders'    },
    { label: 'P&L',         screen: 'PL'        },
    { label: 'Tax P&L',     screen: 'PL'        },
    { label: 'Gift stocks', screen: null        },
    { label: 'Family',      screen: null        },
    { label: 'Downloads',   screen: null        },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Index ticker strip (same as other screens) ── */}
      <IndexTicker onIndexPress={(name) => navigation.navigate('IndexChart', { indexName: name })} />

      {/* ── Top bar: user name + bell ── */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle} numberOfLines={1}>{USER.name}</Text>
        <TouchableOpacity style={styles.bellBtn}>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile card ── */}
        <View style={styles.cardWrap}>
          <TouchableOpacity
            style={styles.idCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Profile')}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.code}>{USER.code}</Text>
              <Text style={styles.email} numberOfLines={1}>{USER.email}</Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{USER.initials}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.privacyRow}>
            <Text style={styles.privacyLabel}>Privacy mode</Text>
            <Switch
              value={privacyMode}
              onValueChange={setPrivacyMode}
              trackColor={{ false: '#E5E7EB', true: colors.primary }}
              thumbColor="#fff"
              style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] }}
            />
          </View>
        </View>

        {/* ── Account ── */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.group}>
          <MenuRow icon="cash-outline"      label="Funds"          onPress={() => navigation.navigate('Funds')} />
          <MenuRow icon="lock-open-outline" label="App Code"       onPress={() => {}} />
          <MenuRow icon="person-outline"    label="Profile"        onPress={() => navigation.navigate('Profile')} />
          <MenuRow icon="settings-outline"  label="Settings"       onPress={() => {}} />
          <MenuRow icon="cube-outline"      label="Connected apps" onPress={() => {}} />
          <MenuRow icon="log-out-outline"   label="Logout"         onPress={() => {}} danger last />
        </View>

        {/* ── Console ── */}
        <View style={styles.consoleHeader}>
          <Text style={styles.sectionTitleInline}>Console</Text>
          <TouchableOpacity onPress={() => setConsoleOn(!consoleOn)}>
            <Ionicons
              name={consoleOn ? 'ellipse' : 'ellipse-outline'}
              size={22}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.consoleLinks}>
          {CONSOLE_LINKS.map(({ label, screen }) => (
            <TouchableOpacity
              key={label}
              style={styles.consoleLinkItem}
              onPress={() => screen && navigation.navigate(screen)}
              activeOpacity={0.6}
            >
              <Text style={styles.consoleLinkText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Support ── */}
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.group}>
          <MenuRow icon="help-buoy-outline"   label="Support portal" onPress={() => {}} />
          <MenuRow icon="help-circle-outline" label="User manual"    onPress={() => {}} />
          <MenuRow icon="call-outline"        label="Contact"        onPress={() => {}} last />
        </View>

        {/* ── Others ── */}
        <Text style={styles.sectionTitle}>Others</Text>
        <View style={styles.group}>
          <MenuRow icon="person-add-outline"    label="Invite friends" onPress={() => {}} />
          <MenuRow icon="document-text-outline" label="Licenses"       onPress={() => {}} last />
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerVersion}>Kite v3 b245</Text>
          <View style={styles.footerBrand}>
            <Ionicons name="leaf" size={14} color={colors.textMuted} />
            <Text style={styles.footerBrandText}>ZERODHA</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
  },
  topBarTitle: { fontSize: 18, fontWeight: '500', color: colors.text, flex: 1, marginRight: 12 },
  bellBtn: { padding: 4 },

  // Profile card
  cardWrap: {
    backgroundColor: '#f3f4f6',
    marginHorizontal: 16, marginBottom: 18, borderRadius: 10, padding: 6,
  },
  idCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 8, padding: 16,
  },
  code: { fontSize: 18, fontWeight: '500', color: colors.text, marginBottom: 6 },
  email: { fontSize: 13, color: colors.textMuted },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#dbe9fb',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '600', color: '#9bb9e0' },
  privacyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  privacyLabel: { fontSize: 14, color: colors.textSecondary },

  // Section titles
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: colors.text,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2,
  },
  sectionTitleInline: { fontSize: 16, fontWeight: '700', color: colors.text },

  // Grouped menu rows
  group: { backgroundColor: '#fff', paddingHorizontal: 16 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, minHeight: 52,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  menuLabel: { fontSize: 16, color: colors.text },

  // Console
  consoleHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  consoleLinks: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  consoleLinkItem: { width: '33.33%', paddingVertical: 12 },
  consoleLinkText: { fontSize: 16, color: colors.primary },

  // Footer
  footer: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  footerVersion: { fontSize: 12, color: colors.textMuted },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerBrandText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1 },
});
