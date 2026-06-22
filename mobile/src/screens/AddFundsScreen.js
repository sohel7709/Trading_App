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

const QUICK_AMOUNTS = [1000, 5000, 10000, 25000, 50000];

const PAYMENT_METHODS = [
  { id: 'upi', label: 'UPI', icon: 'phone-portrait-outline', color: '#5B2D8E' },
  { id: 'netbanking', label: 'Net Banking', icon: 'business-outline', color: '#1B4332' },
];

export default function AddFundsScreen({ navigation }) {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('upi');
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const fetchData = async () => {
    try {
      const w = await api.getWallet();
      setWallet(w);
    } catch (e) { console.warn(e.message); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const balance = Number(wallet?.availableMargin ?? 0);

  const handleAddFunds = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      Alert.alert('Enter amount', 'Please enter a valid amount to add funds');
      return;
    }
    const method = PAYMENT_METHODS.find(m => m.id === selectedPayment);
    setLoading(true);
    try {
      await api.deposit(amt);
      Alert.alert(
        'Funds added',
        `₹${amt.toLocaleString('en-IN')} added successfully via ${method?.label ?? 'UPI'}`,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

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
        <Text style={styles.headerTitle}>Add funds</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Available Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <Text style={styles.balanceValue}>
            ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        {/* Amount Section */}
        <View style={styles.sectionBlock}>
          <Text style={styles.fieldLabel}>Enter amount</Text>
          <View style={styles.inputWrapper}>
            <Text style={styles.rupeePrefix}>₹</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor="#B3BBBF"
              keyboardType="numeric"
              value={amount}
              onChangeText={v => setAmount(v.replace(/[^0-9]/g, ''))}
              autoFocus
            />
          </View>

          {/* Quick Amount Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
          >
            {QUICK_AMOUNTS.map(a => (
              <TouchableOpacity
                key={a}
                style={[styles.quickChip, amount === String(a) && styles.quickChipActive]}
                onPress={() => setAmount(String(a))}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickChipTxt, amount === String(a) && styles.quickChipTxtActive]}>
                  {a >= 1000 ? `${a / 1000},000` : a}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Bank Account Section */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>SELECT BANK</Text>
          <View style={styles.bankRow}>
            <View style={styles.bankLogoCircle}>
              <Text style={styles.bankLogoText}>CB</Text>
            </View>
            <View style={styles.bankInfo}>
              <Text style={styles.bankName}>Canara Bank</Text>
              <Text style={styles.bankAccount}>••••9869</Text>
            </View>
            <View style={styles.radioActive}>
              <View style={styles.radioDot} />
            </View>
          </View>
        </View>

        {/* Payment Method Section */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>PAY VIA</Text>
          <View style={styles.payGrid}>
            {PAYMENT_METHODS.map(method => (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.payCard,
                  selectedPayment === method.id && styles.payCardActive,
                ]}
                onPress={() => setSelectedPayment(method.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={method.icon}
                  size={20}
                  color={selectedPayment === method.id ? '#387ED1' : '#738390'}
                />
                <Text style={[
                  styles.payCardLabel,
                  selectedPayment === method.id && styles.payCardLabelActive,
                ]}>
                  {method.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>

      {/* Footer Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.addBtn, (!amount || loading) && styles.addBtnDisabled]}
          onPress={handleAddFunds}
          disabled={!amount || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.addBtnText}>Add funds</Text>
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

  /* Balance Card */
  balanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderColor: '#E8E8E8',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 12,
  },
  balanceLabel: { fontSize: 14, color: '#738390', fontWeight: '500' },
  balanceValue: { fontSize: 14, fontWeight: '600', color: '#387ED1' },

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

  /* Quick Amount Chips */
  quickRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
    flexDirection: 'row',
  },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  quickChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#387ED1',
  },
  quickChipTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#738390',
  },
  quickChipTxtActive: { color: '#387ED1' },

  /* Bank Row */
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F3F4',
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
  bankName: { fontSize: 14, fontWeight: '600', color: '#1E1E1E' },
  bankAccount: { fontSize: 12, color: '#738390', marginTop: 2 },
  radioActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#387ED1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#387ED1',
  },

  /* Payment Method Grid */
  payGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    gap: 10,
  },
  payCard: {
    flex: 1,
    height: 56,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  payCardActive: {
    borderColor: '#387ED1',
    backgroundColor: '#EFF6FF',
  },
  payCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#738390',
  },
  payCardLabelActive: { color: '#387ED1' },

  /* Footer */
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  addBtn: {
    height: 52,
    borderRadius: 8,
    backgroundColor: '#387ED1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: '#93C5FD' },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
