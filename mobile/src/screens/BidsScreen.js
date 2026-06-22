import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IndexTicker from '../components/IndexTicker';
import { colors } from '../theme/colors';

const TOP_TABS = ['IPO', 'Govt. Securities', 'Auctions', 'Corp Actions'];
const SUB_TABS_IPO = ['Ongoing', 'Upcoming', 'Applied', 'Closed'];
const SUB_TABS_GOVTSEC = ['T-Bills', 'SGBs', 'SDL'];

const IPO_DATA = [
  {
    id: '1', company: 'Liotech Industries Ltd', symbol: 'LIOTECH', type: 'SME',
    price: '₹321', priceRange: null, lot: 400, minAmt: '₹1,28,400',
    dates: '17 Jun – 19 Jun 2026', listingDate: '24 Jun 2026',
    status: 'ONGOING', subscribed: '2.4x',
    gmp: '+₹18', category: 'Engineering',
  },
  {
    id: '2', company: 'Clay Craft India Ltd', symbol: 'CLAYCRAFT', type: 'SME',
    price: null, priceRange: '₹193 – ₹203', lot: 600, minAmt: '₹1,21,800',
    dates: '17 Jun – 19 Jun 2026', listingDate: '24 Jun 2026',
    status: 'ONGOING', subscribed: '1.1x',
    gmp: '+₹5', category: 'Consumer',
  },
  {
    id: '3', company: 'Diksha Polymers Ltd', symbol: 'DIKSHA', type: 'SME',
    price: '₹112', priceRange: null, lot: 1200, minAmt: '₹1,34,400',
    dates: '20 Jun – 24 Jun 2026', listingDate: '27 Jun 2026',
    status: 'UPCOMING', subscribed: null,
    gmp: '+₹8', category: 'Chemicals',
  },
  {
    id: '4', company: 'Swiggy Ltd', symbol: 'SWIGGY', type: 'MAIN',
    price: null, priceRange: '₹340 – ₹371', lot: 40, minAmt: '₹14,840',
    dates: '23 Jun – 25 Jun 2026', listingDate: '30 Jun 2026',
    status: 'UPCOMING', subscribed: null,
    gmp: '+₹22', category: 'Technology',
  },
  {
    id: '5', company: 'CMR Green Technologies Ltd', symbol: 'CMRGREEN', type: 'MAIN',
    price: null, priceRange: '₹182 – ₹192', lot: 78, minAmt: '₹14,976',
    dates: '3 Jun – 5 Jun 2026', listingDate: '10 Jun 2026',
    status: 'CLOSED', subscribed: '8.7x',
    gmp: '-₹3', category: 'Green Energy',
  },
  {
    id: '6', company: 'Hexagon Nutrition Ltd', symbol: 'HEXAGON', type: 'MAIN',
    price: null, priceRange: '₹42 – ₹45', lot: 333, minAmt: '₹14,985',
    dates: '5 Jun – 9 Jun 2026', listingDate: '12 Jun 2026',
    status: 'CLOSED', subscribed: '5.2x',
    gmp: '+₹2', category: 'Pharma',
  },
  {
    id: '7', company: 'SMR Jewels Ltd', symbol: 'SMRJEWELS', type: 'SME',
    price: '₹65', priceRange: null, lot: 2000, minAmt: '₹1,30,000',
    dates: '10 Jun – 12 Jun 2026', listingDate: '17 Jun 2026',
    status: 'APPLIED', subscribed: '12.4x',
    gmp: '+₹4', category: 'Jewellery',
  },
];

const GOVT_SEC = [
  { id: 'g1', name: '91-Day Treasury Bill', type: 'T-BILL', yield: '6.85%', minAmt: '₹10,000', date: 'Every Wednesday', status: 'OPEN' },
  { id: 'g2', name: '182-Day Treasury Bill', type: 'T-BILL', yield: '6.92%', minAmt: '₹10,000', date: 'Every Wednesday', status: 'OPEN' },
  { id: 'g3', name: 'Sovereign Gold Bond 2026-27 Series I', type: 'SGB', yield: '2.5% p.a. + Gold return', minAmt: '1 gram gold', date: '20 Jun – 24 Jun 2026', status: 'UPCOMING' },
  { id: 'g4', name: '8.83% GS 2041', type: 'SDL', yield: '8.83%', minAmt: '₹10,000', date: '18 Jun 2026', status: 'UPCOMING' },
];

const CORP_ACTIONS = [
  { id: 'c1', symbol: 'RELIANCE', action: 'Dividend', detail: '₹9 per share', exDate: '20 Jun 2026', recordDate: '21 Jun 2026' },
  { id: 'c2', symbol: 'TCS', action: 'Dividend', detail: '₹22 per share', exDate: '17 Jul 2026', recordDate: '18 Jul 2026' },
  { id: 'c3', symbol: 'WIPRO', action: 'Bonus', detail: '1:1 Bonus issue', exDate: '5 Jul 2026', recordDate: '6 Jul 2026' },
  { id: 'c4', symbol: 'INFY', action: 'Buyback', detail: '₹1,400 per share', exDate: '10 Jul 2026', recordDate: '11 Jul 2026' },
  { id: 'c5', symbol: 'HDFCBANK', action: 'Dividend', detail: '₹19.50 per share', exDate: '25 Jun 2026', recordDate: '26 Jun 2026' },
];

const STATUS_STYLE = {
  ONGOING:  { bg: '#EFF6FF', text: colors.primary, dot: colors.primary },
  UPCOMING: { bg: '#FEF3C7', text: '#B45309', dot: '#F59E0B' },
  CLOSED:   { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
  APPLIED:  { bg: '#E8F8F2', text: colors.gain, dot: colors.gain },
  OPEN:     { bg: '#EFF6FF', text: colors.primary, dot: colors.primary },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.CLOSED;
  return (
    <View style={[bS.badge, { backgroundColor: s.bg }]}>
      <View style={[bS.dot, { backgroundColor: s.dot }]} />
      <Text style={[bS.badgeText, { color: s.text }]}>{status}</Text>
    </View>
  );
}

const bS = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});

function IPOCard({ item }) {
  const canApply = item.status === 'ONGOING';
  const isApplied = item.status === 'APPLIED';
  const isGMP = item.gmp?.startsWith('+');

  return (
    <View style={styles.ipoCard}>
      <View style={styles.ipoTop}>
        <View style={styles.ipoLogoBox}>
          <Text style={styles.ipoLogoTxt}>{item.symbol.substring(0, 2)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ipoCompany} numberOfLines={1}>{item.company}</Text>
          <View style={styles.ipoSymbolRow}>
            <Text style={styles.ipoSymbol}>{item.symbol}</Text>
            <View style={[styles.typeBadge, item.type === 'SME' && styles.typeBadgeSME]}>
              <Text style={[styles.typeBadgeText, item.type === 'SME' && styles.typeBadgeSMEText]}>{item.type}</Text>
            </View>
          </View>
        </View>
        <StatusBadge status={item.status} />
      </View>

      <View style={styles.ipoDetails}>
        <View style={styles.ipoDetailItem}>
          <Text style={styles.ipoDetailLabel}>Price</Text>
          <Text style={styles.ipoDetailValue}>{item.priceRange ?? item.price}</Text>
        </View>
        <View style={styles.ipoDetailItem}>
          <Text style={styles.ipoDetailLabel}>Lot size</Text>
          <Text style={styles.ipoDetailValue}>{item.lot} shares</Text>
        </View>
        <View style={styles.ipoDetailItem}>
          <Text style={styles.ipoDetailLabel}>Min. amount</Text>
          <Text style={styles.ipoDetailValue}>{item.minAmt}</Text>
        </View>
        <View style={styles.ipoDetailItem}>
          <Text style={styles.ipoDetailLabel}>GMP</Text>
          <Text style={[styles.ipoDetailValue, { color: isGMP ? colors.gain : colors.loss }]}>{item.gmp}</Text>
        </View>
      </View>

      <View style={styles.ipoDatesRow}>
        <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
        <Text style={styles.ipoDates}>{item.dates}</Text>
        {item.subscribed && (
          <View style={styles.subsChip}>
            <Text style={styles.subsText}>{item.subscribed} subscribed</Text>
          </View>
        )}
      </View>

      <View style={styles.ipoActions}>
        <TouchableOpacity style={styles.ipoDetailsBtn}>
          <Text style={styles.ipoDetailsBtnText}>Details</Text>
        </TouchableOpacity>
        {canApply && (
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => Alert.alert('Apply for IPO', `Apply for ${item.company} (${item.symbol})?\n\nPrice: ${item.priceRange ?? item.price}\nMin. amount: ${item.minAmt}`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Apply', onPress: () => Alert.alert('Applied!', `Your application for ${item.symbol} has been submitted.`) },
            ])}
          >
            <Text style={styles.applyBtnText}>Apply Now</Text>
          </TouchableOpacity>
        )}
        {isApplied && (
          <View style={styles.appliedTag}>
            <Ionicons name="checkmark-circle" size={13} color={colors.gain} />
            <Text style={styles.appliedTagText}>Applied</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function GovtSecCard({ item }) {
  return (
    <View style={styles.govtCard}>
      <View style={styles.govtTop}>
        <View style={styles.govtLogoBox}>
          <Text style={styles.govtLogoTxt}>{item.type === 'T-BILL' ? 'TB' : item.type === 'SGB' ? 'SG' : 'SDL'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.govtName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.govtType}>{item.type}</Text>
        </View>
        <StatusBadge status={item.status} />
      </View>
      <View style={styles.ipoDetails}>
        <View style={styles.ipoDetailItem}>
          <Text style={styles.ipoDetailLabel}>Yield</Text>
          <Text style={[styles.ipoDetailValue, { color: colors.gain }]}>{item.yield}</Text>
        </View>
        <View style={styles.ipoDetailItem}>
          <Text style={styles.ipoDetailLabel}>Min. amount</Text>
          <Text style={styles.ipoDetailValue}>{item.minAmt}</Text>
        </View>
      </View>
      <View style={styles.ipoDatesRow}>
        <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
        <Text style={styles.ipoDates}>{item.date}</Text>
      </View>
      <View style={styles.ipoActions}>
        <TouchableOpacity style={styles.ipoDetailsBtn}><Text style={styles.ipoDetailsBtnText}>Learn more</Text></TouchableOpacity>
        {item.status === 'OPEN' && (
          <TouchableOpacity style={styles.applyBtn} onPress={() => Alert.alert('Bid', `Bid for ${item.name}?`)}>
            <Text style={styles.applyBtnText}>Bid Now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function CorpActionCard({ item }) {
  const actionColor = item.action === 'Dividend' ? colors.gain : item.action === 'Buyback' ? colors.primary : '#F59E0B';
  return (
    <View style={styles.corpCard}>
      <View style={styles.corpRow}>
        <View style={styles.corpLogo}>
          <Text style={styles.corpLogoTxt}>{item.symbol.substring(0, 2)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.corpSymbol}>{item.symbol}</Text>
          <Text style={styles.corpDetail}>{item.detail}</Text>
        </View>
        <View style={[styles.corpActionBadge, { backgroundColor: actionColor + '22' }]}>
          <Text style={[styles.corpActionText, { color: actionColor }]}>{item.action}</Text>
        </View>
      </View>
      <View style={styles.corpDates}>
        <Text style={styles.corpDate}>Ex-date: <Text style={{ color: colors.text, fontWeight: '600' }}>{item.exDate}</Text></Text>
        <Text style={styles.corpDate}>Record date: <Text style={{ color: colors.text, fontWeight: '600' }}>{item.recordDate}</Text></Text>
      </View>
    </View>
  );
}

export default function BidsScreen({ navigation }) {
  const [topTab, setTopTab] = useState(0);
  const [ipoSubTab, setIpoSubTab] = useState(0);
  const [govtSubTab, setGovtSubTab] = useState(0);
  const [ipos, setIpos] = useState(IPO_DATA);   // seed with fallback, replaced by live data
  const [ipoSource, setIpoSource] = useState('');
  const insets = useSafeAreaInsets();

  // Fetch live IPOs from NSE (via backend) on focus
  useFocusEffect(useCallback(() => {
    let active = true;
    api.getIpos()
      .then(res => {
        if (active && Array.isArray(res?.ipos) && res.ipos.length > 0) {
          setIpos(res.ipos);
          setIpoSource(res.source || '');
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []));

  const ipoFiltered = ipos.filter(ipo => {
    if (ipoSubTab === 0) return ipo.status === 'ONGOING';
    if (ipoSubTab === 1) return ipo.status === 'UPCOMING';
    if (ipoSubTab === 2) return ipo.status === 'APPLIED';
    if (ipoSubTab === 3) return ipo.status === 'CLOSED';
    return true;
  });

  const govtFiltered = GOVT_SEC.filter(g => {
    if (govtSubTab === 0) return g.type === 'T-BILL';
    if (govtSubTab === 1) return g.type === 'SGB';
    if (govtSubTab === 2) return g.type === 'SDL';
    return true;
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <IndexTicker indexes={{}} onIndexPress={(name) => navigation?.navigate?.('IndexChart', { indexName: name })} />

      {/* Top Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topTabRow} contentContainerStyle={{ paddingHorizontal: 4 }}>
        {TOP_TABS.map((tab, i) => (
          <TouchableOpacity key={tab} style={styles.topTab} onPress={() => setTopTab(i)} activeOpacity={0.7}>
            <Text style={[styles.topTabText, topTab === i && styles.topTabTextActive]}>{tab}</Text>
            {topTab === i && <View style={styles.topTabUnderline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── IPO Tab ── */}
      {topTab === 0 && (
        <>
          <View style={styles.subTabBar}>
            {SUB_TABS_IPO.map((tab, i) => (
              <TouchableOpacity
                key={tab}
                style={[styles.subTab, ipoSubTab === i && styles.subTabActive]}
                onPress={() => setIpoSubTab(i)}
              >
                <Text style={[styles.subTabText, ipoSubTab === i && styles.subTabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            data={ipoFiltered}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <IPOCard item={item} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No IPOs here</Text>
                <Text style={styles.emptyText}>Check other tabs for IPOs</Text>
              </View>
            }
          />
        </>
      )}

      {/* ── Govt. Securities Tab ── */}
      {topTab === 1 && (
        <>
          <View style={styles.subTabBar}>
            {SUB_TABS_GOVTSEC.map((tab, i) => (
              <TouchableOpacity key={tab} style={[styles.subTab, govtSubTab === i && styles.subTabActive]} onPress={() => setGovtSubTab(i)}>
                <Text style={[styles.subTabText, govtSubTab === i && styles.subTabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            data={govtFiltered}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <GovtSecCard item={item} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {/* ── Auctions Tab ── */}
      {topTab === 2 && (
        <View style={styles.emptyState}>
          <Ionicons name="hammer-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Active Auctions</Text>
          <Text style={styles.emptyText}>Check back during scheduled auction windows</Text>
        </View>
      )}

      {/* ── Corp Actions Tab ── */}
      {topTab === 3 && (
        <FlatList
          data={CORP_ACTIONS}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <CorpActionCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.corpHeader}>
              <Text style={styles.corpHeaderText}>Upcoming Corporate Actions</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  topTabRow: { borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 },
  topTab: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 0, alignItems: 'center' },
  topTabText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, paddingBottom: 10 },
  topTabTextActive: { color: colors.primary, fontWeight: '700' },
  topTabUnderline: { height: 2, backgroundColor: colors.primary, borderRadius: 1, width: '100%' },

  subTabBar: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
    gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  subTab: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  subTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  subTabText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  subTabTextActive: { color: '#fff', fontWeight: '700' },

  listContent: { padding: 12, gap: 10, paddingBottom: 100 },

  // IPO Card
  ipoCard: {
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: '#fff', padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  ipoTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  ipoLogoBox: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
    justifyContent: 'center', alignItems: 'center',
  },
  ipoLogoTxt: { fontSize: 13, fontWeight: '800', color: colors.primary },
  ipoCompany: { fontSize: 12, color: colors.textSecondary, marginBottom: 3 },
  ipoSymbolRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ipoSymbol: { fontSize: 15, fontWeight: '800', color: colors.text },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  typeBadgeSME: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  typeBadgeText: { fontSize: 9, fontWeight: '700', color: '#6B7280' },
  typeBadgeSMEText: { color: '#B45309' },
  ipoDetails: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  ipoDetailItem: { width: '50%', paddingVertical: 4 },
  ipoDetailLabel: { fontSize: 10, color: colors.textMuted, marginBottom: 1 },
  ipoDetailValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  ipoDatesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  ipoDates: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  subsChip: { backgroundColor: '#E8F8F2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  subsText: { fontSize: 11, fontWeight: '700', color: colors.gain },
  ipoActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ipoDetailsBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  ipoDetailsBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  applyBtn: { flex: 1, backgroundColor: colors.primary, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  applyBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  appliedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center', paddingVertical: 9, borderRadius: 8, backgroundColor: colors.gainLight },
  appliedTagText: { fontSize: 13, fontWeight: '700', color: colors.gain },

  // Govt Sec
  govtCard: {
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: '#fff', padding: 14,
  },
  govtTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  govtLogoBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', justifyContent: 'center', alignItems: 'center' },
  govtLogoTxt: { fontSize: 11, fontWeight: '800', color: '#16A34A' },
  govtName: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
  govtType: { fontSize: 11, color: colors.textMuted },

  // Corp Actions
  corpHeader: { paddingBottom: 8 },
  corpHeaderText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  corpCard: {
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: '#fff', padding: 14,
  },
  corpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  corpLogo: { width: 38, height: 38, borderRadius: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  corpLogoTxt: { fontSize: 12, fontWeight: '800', color: colors.primary },
  corpSymbol: { fontSize: 15, fontWeight: '800', color: colors.text },
  corpDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  corpActionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  corpActionText: { fontSize: 12, fontWeight: '700' },
  corpDates: { flexDirection: 'row', gap: 16 },
  corpDate: { fontSize: 12, color: colors.textSecondary },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
});
