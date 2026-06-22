import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { api } from '../api/client';

const WITHDRAW_TYPES = [
  { id: 'regular', label: 'Regular', timing: '24–48 hours' },
  { id: 'instant', label: 'Instant', timing: 'Max ₹2,00,000' },
];

// Withdrawals are temporarily disabled due to a technical issue.
const WITHDRAW_SUSPENDED = true;
const SUSPENDED_MESSAGE =
  'Withdrawals are temporarily suspended due to a technical issue. Our team is working on it — please try again later.';

export default function WithdrawScreen({ navigation }) {
  const [wallet, setWallet] = useState(null);
  const [withdrawType, setWithdrawType] = useState('regular');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const fetchData = async () => {
    try {
      const w = await api.getWallet();
      setWallet(w);
    } catch (e) { console.warn(e.message); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const available = Number(wallet?.availableMargin ?? 0);

  const handleWithdraw = async () => {
    if (WITHDRAW_SUSPENDED) {
      return Alert.alert('Withdrawals suspended', SUSPENDED_MESSAGE);
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) return Alert.alert('Invalid amount', 'Enter a valid amount');
    if (amt > available) {
      return Alert.alert(
        'Insufficient funds',
        `Max withdrawable: ₹${available.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      );
    }
    setLoading(true);
    try {
      await api.withdraw(amt);
      Alert.alert(
        'Withdrawal initiated',
        `₹${amt.toLocaleString('en-IN')} withdrawal has been initiated`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const maxLabel = available.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#1E1E1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Withdraw funds</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Suspension banner */}
        {WITHDRAW_SUSPENDED && (
          <View style={styles.suspendBanner}>
            <Ionicons name="warning-outline" size={20} color="#B45309" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.suspendTitle}>Withdrawals temporarily suspended</Text>
              <Text style={styles.suspendText}>{SUSPENDED_MESSAGE}</Text>
            </View>
          </View>
        )}

        {/* Withdrawable Balance Hero Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Withdrawable balance</Text>
          <Text style={styles.heroAmount}>
            ₹{available.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.heroNote}>updated every hour</Text>
        </View>

        {/* Withdrawal Type */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>WITHDRAWAL TYPE</Text>
          {WITHDRAW_TYPES.map(({ id, label, timing }, idx) => (
            <TouchableOpacity
              key={id}
              style={[
                styles.radioRow,
                idx < WITHDRAW_TYPES.length - 1 && styles.radioRowBorder,
              ]}
              onPress={() => setWithdrawType(id)}
              activeOpacity={0.7}
            >
              <View style={[styles.radio, withdrawType === id && styles.radioActive]}>
                {withdrawType === id && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.radioLabel}>{label}</Text>
              <Text style={styles.radioTiming}>{timing}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Amount Input */}
        <View style={styles.sectionBlock}>
          <Text style={styles.fieldLabel}>Enter amount</Text>
          <View style={[styles.inputWrapper, WITHDRAW_SUSPENDED && styles.inputWrapperDisabled]}>
            <Text style={styles.rupeePrefix}>₹</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor="#B3BBBF"
              keyboardType="numeric"
              value={amount}
              editable={!WITHDRAW_SUSPENDED}
              onChangeText={v => setAmount(v.replace(/[^0-9]/g, ''))}
            />
          </View>
          <Text style={styles.maxHint}>Max: ₹{maxLabel}</Text>
        </View>

        {/* Bank Account Row */}
        <View style={styles.sectionBlock}>
          <View style={styles.bankRow}>
            <View style={styles.bankLogoCircle}>
              <Text style={styles.bankLogoText}>CB</Text>
            </View>
            <View style={styles.bankInfo}>
              <Text style={styles.bankName}>Canara Bank ••••9869</Text>
            </View>
            <View style={styles.primaryBadge}>
              <Text style={styles.primaryBadgeText}>Primary</Text>
            </View>
          </View>
        </View>

        {/* Note */}
        <Text style={styles.transferNote}>
          Funds will be transferred to your registered bank account
        </Text>

      </ScrollView>

      {/* Footer Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.withdrawBtn, (WITHDRAW_SUSPENDED || !amount || loading) && styles.withdrawBtnDisabled]}
          onPress={handleWithdraw}
          disabled={WITHDRAW_SUSPENDED || !amount || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.withdrawBtnText}>
                {WITHDRAW_SUSPENDED ? 'Withdrawals unavailable' : 'Withdraw'}
              </Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1E1E1E',
    textAlign: 'center',
  },
  headerRight: { width: 32 },

  scrollContent: { paddingBottom: 20 },

  // Suspension banner
  suspendBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D',
    borderRadius: 8, padding: 14, marginHorizontal: 16, marginTop: 14,
  },
  suspendTitle: { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 3 },
  suspendText: { fontSize: 12.5, color: '#92400E', lineHeight: 18 },

  /* Hero Balance Card */
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E8E8E8',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  heroLabel: {
    fontSize: 12,
    color: '#738390',
    fontWeight: '500',
    marginBottom: 6,
  },
  heroAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E1E1E',
    marginBottom: 6,
  },
  heroNote: {
    fontSize: 11,
    color: '#B3BBBF',
  },

  /* Section Blocks */
  sectionBlock: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E8E8E8',
    marginTop: 12,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#738390',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#738390',
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },

  /* Radio Rows */
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 14,
  },
  radioRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#C9CDD4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {
    borderColor: '#387ED1',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#387ED1',
  },
  radioLabel: {
    flex: 1,
    fontSize: 14,
    color: '#1E1E1E',
    fontWeight: '500',
  },
  radioTiming: {
    fontSize: 13,
    color: '#738390',
  },

  /* Amount Input */
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 6,
    marginHorizontal: 16,
    height: 48,
    paddingHorizontal: 12,
  },
  inputWrapperDisabled: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  rupeePrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E1E1E',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1E1E1E',
    padding: 0,
  },
  maxHint: {
    fontSize: 12,
    color: '#B3BBBF',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
  },

  /* Bank Row */
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  bankLogoCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1B2A7A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankLogoText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bankInfo: { flex: 1 },
  bankName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E1E1E',
  },
  primaryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  primaryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#387ED1',
  },

  /* Transfer Note */
  transferNote: {
    fontSize: 12,
    color: '#B3BBBF',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    lineHeight: 18,
  },

  /* Footer */
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  withdrawBtn: {
    height: 52,
    borderRadius: 8,
    backgroundColor: '#387ED1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  withdrawBtnDisabled: { backgroundColor: '#93C5FD' },
  withdrawBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
