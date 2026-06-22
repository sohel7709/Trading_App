import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { USER } from './AccountScreen';

/* A row with a grey label on the left and value on the right (Zerodha style) */
const InfoRow = ({ label, value, valueColor }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, valueColor && { color: valueColor }]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [sessionsOpen, setSessionsOpen] = useState(false);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* ── Name + avatar ── */}
        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{USER.name}</Text>
            <Text style={styles.code}>{USER.code}</Text>
          </View>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{USER.initials}</Text>
            </View>
            <View style={styles.editBadge}>
              <Ionicons name="pencil" size={13} color="#fff" />
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Password & Security ── */}
        <View style={styles.rowBetween}>
          <Text style={styles.infoLabel}>Password &amp; Security</Text>
          <TouchableOpacity><Text style={styles.linkText}>Manage</Text></TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* ── Account details ── */}
        <View style={styles.rowBetween}>
          <Text style={styles.infoLabel}>Support code</Text>
          <TouchableOpacity style={styles.supportRow}>
            <View style={styles.supportDot} />
            <Text style={styles.linkText}>View</Text>
          </TouchableOpacity>
        </View>

        <InfoRow label="E-mail"     value={USER.email} />
        <InfoRow label="Phone"      value={`*${USER.phone}`} />
        <InfoRow label="PAN"        value={USER.pan} />
        <InfoRow label="Demat (BO)" value={USER.demat} valueColor={colors.primary} />
        <InfoRow label="BO ID"      value={USER.boId} />

        <TouchableOpacity style={{ paddingVertical: 14 }}>
          <Text style={styles.linkText}>Manage account</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* ── Bank accounts ── */}
        <Text style={styles.sectionHeading}>Bank accounts</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.bankName}>{USER.bank.toUpperCase()} LTD</Text>
          <Text style={styles.infoValue}>*{USER.bankLast4}</Text>
        </View>

        <View style={styles.divider} />

        {/* ── Segments ── */}
        <InfoRow label="Segments"            value="NSE, MF, BSE" valueColor={colors.primary} />
        <InfoRow label="Demat authorisation" value="eDIS"         valueColor={colors.primary} />

        <View style={styles.divider} />

        {/* ── Active sessions ── */}
        <TouchableOpacity style={styles.rowBetween} onPress={() => setSessionsOpen(!sessionsOpen)}>
          <Text style={styles.linkText}>View active sessions</Text>
          <Ionicons name={sessionsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
        </TouchableOpacity>
        {sessionsOpen && (
          <View style={styles.sessionBox}>
            <Text style={styles.sessionLine}>This device · Mobile · Active now</Text>
            <Text style={styles.sessionSub}>Kite Android · Last seen just now</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 22, fontWeight: '600', color: colors.text },

  nameRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 20,
  },
  name: { fontSize: 22, color: colors.text, fontWeight: '400', marginBottom: 6 },
  code: { fontSize: 14, color: colors.textMuted },

  avatarWrap: { width: 84, height: 84, justifyContent: 'center', alignItems: 'center' },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#dbe9fb',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '500', color: '#9bb9e0' },
  editBadge: {
    position: 'absolute', right: 2, bottom: 4,
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff',
  },

  divider: { height: 1, backgroundColor: '#eee', marginVertical: 6, marginHorizontal: 20 },

  rowBetween: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 11,
  },
  infoLabel: { fontSize: 15, color: colors.textSecondary },
  infoValue: { fontSize: 15, color: colors.text, maxWidth: '60%', textAlign: 'right' },
  linkText: { fontSize: 15, color: colors.primary, fontWeight: '500' },

  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  supportDot: {
    width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: colors.primary,
  },

  sectionHeading: {
    fontSize: 17, fontWeight: '600', color: colors.text,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },
  bankName: { fontSize: 15, color: colors.textSecondary },

  sessionBox: { paddingHorizontal: 20, paddingBottom: 16 },
  sessionLine: { fontSize: 14, color: colors.text, marginBottom: 2 },
  sessionSub: { fontSize: 12, color: colors.textMuted },
});
