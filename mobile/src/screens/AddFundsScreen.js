import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal,
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

// PSP bank shown on the receipt footer — matches each app's real settlement bank
const UPI_APPS = [
  { id: 'phonepe',   label: 'PhonePe',    short: 'पे', bg: '#5F259F', pspBank: 'YES BANK' },
  { id: 'googlepay', label: 'Google Pay', short: 'G',  bg: '#1A73E8', pspBank: 'ICICI BANK' },
  { id: 'paytm',     label: 'Paytm',      short: 'P',  bg: '#00BAF2', pspBank: 'PAYTM PAYMENTS BANK' },
  { id: 'bhim',      label: 'BHIM UPI',   short: 'B',  bg: '#00875A', pspBank: 'NPCI' },
];

const BANK = { name: 'Canara Bank', type: 'SAVINGS', last4: '9869' };
const MERCHANT = { name: 'Zerodha Broking Ltd', vpa: 'zerodha.broking@ybl' };

const PIN_LEN = 6;
const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['del', '0', 'PAY'],
];

function genTxnId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `T${d.getFullYear() % 100}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${Math.floor(1000 + Math.random() * 9000)}${Math.floor(100000 + Math.random() * 900000)}`;
}
function genUTR() {
  return String(Math.floor(100000000000 + Math.random() * 900000000000));
}
function formatTxnTime(d) {
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${time} on ${date}`;
}

export default function AddFundsScreen({ navigation }) {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('upi');
  const [selectedUpiApp, setSelectedUpiApp] = useState('phonepe');
  const [loading, setLoading] = useState(false);
  // UPI flow: null | 'pin' | 'processing' | 'success'
  const [pinStage, setPinStage] = useState(null);
  const [pin, setPin] = useState('');
  const [receipt, setReceipt] = useState(null);
  const insets = useSafeAreaInsets();

  const fetchData = async () => {
    try {
      const w = await api.getWallet();
      setWallet(w);
    } catch (e) { console.warn(e.message); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const balance = Number(wallet?.availableMargin ?? 0);
  const upiApp = UPI_APPS.find(a => a.id === selectedUpiApp) ?? UPI_APPS[0];

  const closeAndReturn = () => {
    setPinStage(null);
    setPin('');
    setReceipt(null);
    navigation.goBack();
  };

  const completeDeposit = async (method, upiAppLabel) => {
    const amt = Number(amount);
    try {
      await api.deposit(amt, method, upiAppLabel ?? null);
      if (method === 'UPI') {
        setReceipt({
          txnId: genTxnId(),
          utr: genUTR(),
          time: formatTxnTime(new Date()),
        });
        setPinStage('success');
      } else {
        setPinStage(null);
        Alert.alert(
          'Funds added',
          `₹${amt.toLocaleString('en-IN')} added successfully via Net Banking`,
          [{ text: 'Done', onPress: () => navigation.goBack() }]
        );
      }
    } catch (e) {
      setPinStage(null);
      setPin('');
      Alert.alert('Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFunds = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      Alert.alert('Enter amount', 'Please enter a valid amount to add funds');
      return;
    }
    if (selectedPayment === 'upi') {
      setPin('');
      setPinStage('pin');
      return;
    }
    setLoading(true);
    completeDeposit('NETBANKING');
  };

  const submitPin = () => {
    if (pin.length !== PIN_LEN) {
      Alert.alert('Enter PIN', `Enter your ${PIN_LEN}-digit UPI PIN`);
      return;
    }
    setPinStage('processing');
    setTimeout(() => completeDeposit('UPI', upiApp.label), 1100);
  };

  const onKeyPress = (key) => {
    if (pinStage !== 'pin') return;
    if (key === 'del') { setPin(p => p.slice(0, -1)); return; }
    if (key === 'PAY') { submitPin(); return; }
    if (pin.length >= PIN_LEN) return;
    setPin(p => p + key);
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
              <Text style={styles.bankName}>{BANK.name}</Text>
              <Text style={styles.bankAccount}>••••{BANK.last4}</Text>
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

          {/* UPI app picker */}
          {selectedPayment === 'upi' && (
            <View style={styles.upiAppsRow}>
              {UPI_APPS.map(app => (
                <TouchableOpacity
                  key={app.id}
                  style={[styles.upiAppCard, selectedUpiApp === app.id && styles.upiAppCardActive]}
                  onPress={() => setSelectedUpiApp(app.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.upiAppLogo, { backgroundColor: app.bg }]}>
                    <Text style={styles.upiAppLogoTxt}>{app.short}</Text>
                  </View>
                  <Text style={[styles.upiAppLabel, selectedUpiApp === app.id && styles.upiAppLabelActive]}>
                    {app.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

      </ScrollView>

      {/* ── UPI PIN screen — mirrors the real PhonePe/GPay PIN entry ── */}
      <Modal visible={pinStage === 'pin' || pinStage === 'processing'} animationType="slide" onRequestClose={() => { setPinStage(null); setPin(''); }}>
        <View style={[styles.pinScreen, { paddingTop: insets.top }]}>
          {/* UPI branded top bar */}
          <View style={styles.upiTopBar}>
            <View>
              <View style={styles.upiLogoRow}>
                <Text style={styles.upiLogoText}>UPI</Text>
                <View style={styles.upiLogoFlag}>
                  <View style={[styles.flagBar, { backgroundColor: '#FF9933' }]} />
                  <View style={[styles.flagBar, { backgroundColor: '#128807' }]} />
                </View>
              </View>
              <Text style={styles.upiLogoSub}>UNIFIED PAYMENTS INTERFACE</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setPinStage(null); setPin(''); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#1E1E1E" />
            </TouchableOpacity>
          </View>

          {/* Debit account */}
          <View style={styles.acctRow}>
            <Text style={styles.acctTxt}>
              {BANK.type}: <Text style={styles.acctTxtBold}>{BANK.name}</Text>  - {BANK.last4}
            </Text>
          </View>

          {/* Pay-to banner */}
          <View style={styles.payBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.payBannerAmt}>Pay ₹{Number(amount || 0).toLocaleString('en-IN')}.00</Text>
              <Text style={styles.payBannerTo}>To {MERCHANT.name}</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color="#4B5563" style={{ marginRight: 8 }} />
            <View style={styles.payBannerAvatar}>
              <Ionicons name="business" size={16} color="#fff" />
            </View>
          </View>

          {pinStage === 'processing' ? (
            <View style={styles.processingWrap}>
              <ActivityIndicator size="large" color={upiApp.bg} />
              <Text style={styles.processingTxt}>Processing payment…</Text>
            </View>
          ) : (
            <>
              {/* Title + dots sit centered in the free space above the keypad,
                  matching the NPCI PIN screen's generous vertical whitespace */}
              <View style={styles.pinPromptWrap}>
                <Text style={styles.pinPromptTxt}>Enter your PIN</Text>
                <View style={styles.pinDotsRow}>
                  {Array.from({ length: PIN_LEN }).map((_, i) => (
                    <View key={i} style={[styles.pinCircle, pin.length > i && styles.pinCircleFilled]} />
                  ))}
                </View>
              </View>

              <View style={styles.pinFooterNote}>
                <Ionicons name="information-circle-outline" size={13} color="#B45309" />
                <Text style={styles.pinFooterNoteTxt}>Never enter your UPI PIN to receive money</Text>
              </View>

              {/* Keypad */}
              <View style={styles.keypad}>
                {KEYPAD.map((row, ri) => (
                  <View key={ri} style={styles.keypadRow}>
                    {row.map((key, ki) => {
                      if (key === 'del') {
                        return (
                          <TouchableOpacity key={ki} style={styles.keypadKey} onPress={() => onKeyPress(key)} activeOpacity={0.6}>
                            <View style={styles.delKeyBg}>
                              <Ionicons name="close" size={18} color="#3B4CA8" />
                            </View>
                          </TouchableOpacity>
                        );
                      }
                      if (key === 'PAY') {
                        const ready = pin.length === PIN_LEN;
                        return (
                          <TouchableOpacity
                            key={ki}
                            style={styles.keypadKey}
                            onPress={() => onKeyPress(key)}
                            activeOpacity={0.8}
                          >
                            <View style={[styles.payKeyBg, { backgroundColor: ready ? '#1F2C6B' : '#A9AFC7' }]}>
                              <Text style={styles.payKeyTxt}>Pay</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <TouchableOpacity key={ki} style={styles.keypadKey} onPress={() => onKeyPress(key)} activeOpacity={0.6}>
                          <View style={styles.digitKeyBg}>
                            <Text style={styles.keypadKeyTxt}>{key}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* ── Transaction Successful receipt ── */}
      <Modal visible={pinStage === 'success'} animationType="slide" onRequestClose={closeAndReturn}>
        <View style={[styles.successScreen, { paddingTop: insets.top }]}>
          {/* Green success header — a small chip in the selected app's brand
              colour ties the receipt to whichever app was used, without
              reskinning the whole screen to mimic that app's own UI */}
          <View style={styles.successHeader}>
            <TouchableOpacity onPress={closeAndReturn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={styles.successHeaderTitle}>Transaction Successful</Text>
              <Text style={styles.successHeaderSub}>{receipt?.time}</Text>
            </View>
            <View style={[styles.appChip, { backgroundColor: upiApp.bg }]}>
              <Text style={styles.appChipTxt}>{upiApp.short}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Paid to */}
            <Text style={styles.successSectionLabel}>Paid to</Text>
            <View style={styles.paidToRow}>
              <View style={[styles.paidToAvatar, { backgroundColor: upiApp.bg }]}>
                <Ionicons name="business" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.paidToName}>{MERCHANT.name}</Text>
                <Text style={styles.paidToVpa}>{MERCHANT.vpa}</Text>
              </View>
              <Text style={styles.paidToAmt}>₹{Number(amount || 0).toLocaleString('en-IN')}</Text>
            </View>

            <View style={styles.bankingNameRow}>
              <Text style={styles.bankingNameLabel}>Banking Name</Text>
              <Text style={styles.bankingNameLabel}> : </Text>
              <Text style={styles.bankingNameVal}>{MERCHANT.name}</Text>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" style={{ marginLeft: 4 }} />
            </View>

            <View style={styles.divider} />

            {/* Transfer details */}
            <View style={styles.transferHeaderRow}>
              <Ionicons name="reader-outline" size={16} color="#4B5563" />
              <Text style={styles.transferHeaderTxt}>Transfer Details</Text>
              <View style={{ flex: 1 }} />
              <Ionicons name="chevron-up" size={16} color="#9AA4AB" />
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{upiApp.label} Transaction ID</Text>
              <View style={styles.detailValRow}>
                <Text style={styles.detailVal}>{receipt?.txnId}</Text>
                <Ionicons name="copy-outline" size={14} color="#9AA4AB" style={{ marginLeft: 8 }} />
              </View>
            </View>

            <Text style={[styles.detailLabel, { marginTop: 14 }]}>Debited from</Text>
            <View style={styles.detailRow}>
              <View style={styles.debitFromRow}>
                <View style={styles.miniBankIcon}>
                  <Ionicons name="business-outline" size={14} color="#8B1E3F" />
                </View>
                <Text style={styles.detailVal}>XXXXXXX{BANK.last4}</Text>
              </View>
              <Text style={styles.detailVal}>₹{Number(amount || 0).toLocaleString('en-IN')}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.utrTxt}>UTR: {receipt?.utr}</Text>
              <Ionicons name="copy-outline" size={14} color="#9AA4AB" />
            </View>

            <View style={styles.divider} />

            {/* Action icons */}
            <View style={styles.actionsRow}>
              {[
                { icon: 'trending-up-outline', label: 'Send Again' },
                { icon: 'time-outline', label: 'View History' },
                { icon: 'git-branch-outline', label: 'Split Expense' },
                { icon: 'share-social-outline', label: 'Share Receipt' },
              ].map(a => (
                <TouchableOpacity key={a.label} style={styles.actionItem} activeOpacity={0.7}>
                  <View style={[styles.actionIconCircle, { backgroundColor: upiApp.bg + '1A' }]}>
                    <Ionicons name={a.icon} size={18} color={upiApp.bg} />
                  </View>
                  <Text style={styles.actionLabel}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.supportRow} activeOpacity={0.7}>
              <Ionicons name="chatbubble-ellipses-outline" size={17} color="#4B5563" />
              <Text style={styles.supportTxt}>Contact {upiApp.label} Support</Text>
              <View style={{ flex: 1 }} />
              <Ionicons name="chevron-forward" size={16} color="#9AA4AB" />
            </TouchableOpacity>

            <View style={styles.poweredByWrap}>
              <Text style={styles.poweredByTxt}>Powered by</Text>
              <View style={styles.poweredByLogoRow}>
                <Text style={styles.poweredByUpi}>UPI</Text>
                <Ionicons name="checkmark-circle" size={12} color={upiApp.bg} style={{ marginHorizontal: 3 }} />
                <Text style={[styles.poweredByBank, { color: upiApp.bg }]}>{upiApp.pspBank}</Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.doneFooter, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity style={styles.doneBtn} onPress={closeAndReturn} activeOpacity={0.85}>
              <Text style={styles.doneBtnTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

  /* UPI apps */
  upiAppsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  upiAppCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    gap: 6,
  },
  upiAppCardActive: {
    borderColor: '#387ED1',
    backgroundColor: '#EFF6FF',
  },
  upiAppLogo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upiAppLogoTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  upiAppLabel: { fontSize: 10, fontWeight: '600', color: '#738390' },
  upiAppLabelActive: { color: '#387ED1' },

  /* ══════════ UPI PIN screen (matches real PhonePe/NPCI UI) ══════════ */
  pinScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  upiTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
  },
  upiLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upiLogoText: { fontSize: 20, fontWeight: '800', color: '#1E1E1E', fontStyle: 'italic', letterSpacing: 0.5 },
  upiLogoFlag: { flexDirection: 'row', gap: 2, marginLeft: 2 },
  flagBar: { width: 4, height: 12, borderRadius: 1 },
  upiLogoSub: { fontSize: 8, color: '#9AA4AB', letterSpacing: 0.6, marginTop: 3, fontWeight: '600' },

  acctRow: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDEEF0',
  },
  acctTxt: { fontSize: 14, color: '#4B5563' },
  acctTxtBold: { fontWeight: '700', color: '#1E1E1E' },

  payBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E9C9',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  payBannerAmt: { fontSize: 20, fontWeight: '800', color: '#1E1E1E' },
  payBannerTo: { fontSize: 13, color: '#6B6350', marginTop: 3, fontWeight: '500' },
  payBannerAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#387ED1',
    justifyContent: 'center', alignItems: 'center',
  },

  // Title + dots claim the free space between the pay banner and the
  // footer note/keypad, so they sit centered rather than glued to the top —
  // matching the generous whitespace of the real NPCI PIN screen.
  pinPromptWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pinPromptTxt: { fontSize: 17, fontWeight: '700', color: '#1E1E1E' },
  pinDotsRow: { flexDirection: 'row', gap: 20, marginTop: 28 },
  pinCircle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: '#C6CCD1',
  },
  pinCircleFilled: { backgroundColor: '#1E1E1E', borderColor: '#1E1E1E' },

  pinFooterNote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#EDEEF0',
  },
  pinFooterNoteTxt: { fontSize: 12, color: '#8A93A0' },

  keypad: { paddingBottom: 10 },
  keypadRow: { flexDirection: 'row' },
  keypadKey: {
    flex: 1, height: 64,
    justifyContent: 'center', alignItems: 'center',
  },
  digitKeyBg: {
    width: 60, height: 48, borderRadius: 8,
    backgroundColor: '#F0EFF7',
    justifyContent: 'center', alignItems: 'center',
  },
  keypadKeyTxt: { color: '#1E1E1E', fontSize: 21, fontWeight: '600' },
  // Boxed "×" clear key — matches the outlined delete glyph on the real
  // UPI keypad, distinct from the filled digit key-caps
  delKeyBg: {
    width: 60, height: 48, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#C7D2FE',
    backgroundColor: '#F5F7FF',
    justifyContent: 'center', alignItems: 'center',
  },
  payKeyBg: {
    width: 60, height: 48, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  payKeyTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  processingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  processingTxt: { fontSize: 14, color: '#6B7280', fontWeight: '500' },

  /* ══════════ Transaction Successful receipt ══════════ */
  successScreen: { flex: 1, backgroundColor: '#fff' },
  successHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0FA958',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  successHeaderTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  successHeaderSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  appChip: {
    width: 30, height: 30, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  appChipTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },

  successSectionLabel: { fontSize: 12, color: '#9AA4AB', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  paidToRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  paidToAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#6C4BA6',
    justifyContent: 'center', alignItems: 'center',
  },
  paidToName: { fontSize: 16, fontWeight: '700', color: '#1E1E1E' },
  paidToVpa: { fontSize: 12, color: '#9AA4AB', marginTop: 2 },
  paidToAmt: { fontSize: 16, fontWeight: '700', color: '#1E1E1E' },

  bankingNameRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 },
  bankingNameLabel: { fontSize: 12, color: '#9AA4AB' },
  bankingNameVal: { fontSize: 12, fontWeight: '700', color: '#374151' },

  divider: { height: 1, backgroundColor: '#EDEEF0', marginVertical: 18, marginHorizontal: 16 },

  transferHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  transferHeaderTxt: { fontSize: 14, fontWeight: '700', color: '#1E1E1E' },

  detailRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12,
  },
  detailLabel: { fontSize: 12, color: '#9AA4AB', paddingHorizontal: 16 },
  detailValRow: { flexDirection: 'row', alignItems: 'center' },
  detailVal: { fontSize: 13, fontWeight: '700', color: '#1E1E1E' },
  debitFromRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniBankIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#FCE8EE',
    justifyContent: 'center', alignItems: 'center',
  },
  utrTxt: { fontSize: 12, color: '#9AA4AB' },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8 },
  actionItem: { alignItems: 'center', gap: 8, width: 76 },
  actionIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F3EEFC',
    justifyContent: 'center', alignItems: 'center',
  },
  actionLabel: { fontSize: 10, color: '#4B5563', textAlign: 'center', fontWeight: '500' },

  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  supportTxt: { fontSize: 14, color: '#1E1E1E', fontWeight: '500' },

  poweredByWrap: { alignItems: 'center', marginTop: 22, marginBottom: 8 },
  poweredByTxt: { fontSize: 11, color: '#9AA4AB' },
  poweredByLogoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  poweredByUpi: { fontSize: 13, fontWeight: '800', color: '#6B7280', fontStyle: 'italic' },
  poweredByBank: { fontSize: 12, fontWeight: '700', color: '#387ED1' },

  doneFooter: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#EDEEF0',
  },
  doneBtn: {
    height: 50, borderRadius: 8,
    backgroundColor: '#0FA958',
    justifyContent: 'center', alignItems: 'center',
  },
  doneBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

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
