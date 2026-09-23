/**
 * OrderEntryScreen.js (Production Upgraded)
 * ─────────────────────────────────────────────────────────
 * Institutional Simulated Trade Execution Screen:
 * - Symbol, Live LTP & expiry
 * - Lot stepper & margin required calculator
 * - Market / Limit segment toggle
 * - Buy / Sell execution via POST /trade
 * - Duplicate click prevention (loading spinner & disabled state)
 * - Inline risk/rejection alert banner
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Switch, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { colors } from '../theme/colors';
import useMarketState from '../hooks/useMarketState';

export default function OrderEntryScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { isHalted, reason: haltReason } = useMarketState();
  const {
    symbol = 'NIFTY 24850 CE',
    ltp = 167.05,
    initialMode = 'BUY',
    lotSize = 25,
    expiry = 'NEAR'
  } = route.params || {};

  const [mode, setMode] = useState(initialMode); // 'BUY' or 'SELL'
  const [type, setType] = useState('MARKET'); // 'MARKET' or 'LIMIT'
  const [lots, setLots] = useState(1);
  const [price, setPrice] = useState(ltp ? ltp.toString() : '100');
  const [stopLoss, setStopLoss] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isBuy = mode === 'BUY';
  const effectivePrice = type === 'LIMIT' ? (parseFloat(price) || ltp) : ltp;
  const marginRequired = lots * lotSize * effectivePrice;

  const handleExecuteTrade = async () => {
    if (loading) return;
    if (isHalted) {
      setErrorMessage(`Trading is halted: ${haltReason || 'Exchange Circuit Breaker Active'}`);
      return;
    }
    setErrorMessage('');
    setLoading(true);

    try {
      const payload = {
        symbol,
        side: mode,
        lots: Number(lots),
        qty: lots * lotSize,
        price: effectivePrice,
        type,
        expiry
      };

      const res = await api.placeTrade(payload);

      // Immediately navigate to Portfolio Open Positions
      navigation.navigate('Positions', { screen: 'PositionsMain' });
    } catch (err) {
      console.warn('[Trade Execution Error]:', err.message);
      const msg = err.message || 'Order rejected by trading engine.';
      setErrorMessage(msg.includes('loss') ? 'Trade rejected: Max daily loss reached.' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Dimmed background overlay */}
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={() => navigation.goBack()}
      />

      {/* Bottom Sheet Modal */}
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{symbol}</Text>
            <Text style={styles.headerSubtitle}>
              1 lot = {lotSize} units • LTP ₹{Number(ltp || 0).toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={22} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Market Circuit Breaker / Halt Banner */}
        {isHalted && (
          <View style={[styles.errorBanner, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}>
            <Ionicons name="alert-circle" size={18} color="#b91c1c" />
            <Text style={[styles.errorBannerText, { color: '#991b1b', fontWeight: '700' }]}>
              Trading Temporarily Halted: {haltReason || 'Circuit breaker active. New orders paused.'}
            </Text>
          </View>
        )}

        {/* Error / Risk Rejection Banner */}
        {errorMessage && !isHalted ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={18} color="#b91c1c" />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Buy / Sell Selector */}
        <View style={styles.segmentWrap}>
          <TouchableOpacity
            style={[styles.segmentBtn, isBuy && styles.segmentBtnActiveBuy]}
            onPress={() => setMode('BUY')}
            disabled={loading}
          >
            <Text style={[styles.segmentText, isBuy && styles.segmentTextActiveBuy]}>BUY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, !isBuy && styles.segmentBtnActiveSell]}
            onPress={() => setMode('SELL')}
            disabled={loading}
          >
            <Text style={[styles.segmentText, !isBuy && styles.segmentTextActiveSell]}>SELL</Text>
          </TouchableOpacity>
        </View>

        {/* Quantity Stepper */}
        <View style={styles.fieldRow}>
          <View>
            <Text style={styles.fieldLabel}>Quantity</Text>
            <Text style={styles.fieldSubLabel}>{lots * lotSize} total units</Text>
          </View>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setLots(Math.max(1, lots - 1))}
              disabled={loading}
            >
              <Ionicons name="remove" size={16} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.stepVal}>{lots} {lots === 1 ? 'lot' : 'lots'}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setLots(lots + 1)}
              disabled={loading}
            >
              <Ionicons name="add" size={16} color="#0f172a" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Market / Limit Order Type */}
        <View style={styles.typeSegmentWrap}>
          <TouchableOpacity
            style={[styles.typeSegmentBtn, type === 'MARKET' && styles.typeSegmentActive]}
            onPress={() => setType('MARKET')}
            disabled={loading}
          >
            <Text style={[styles.typeSegmentText, type === 'MARKET' && styles.typeSegmentTextActive]}>
              Market Price
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeSegmentBtn, type === 'LIMIT' && styles.typeSegmentActive]}
            onPress={() => setType('LIMIT')}
            disabled={loading}
          >
            <Text style={[styles.typeSegmentText, type === 'LIMIT' && styles.typeSegmentTextActive]}>
              Limit Order
            </Text>
          </TouchableOpacity>
        </View>

        {/* Limit Price Input */}
        {type === 'LIMIT' && (
          <View style={styles.inputWrap}>
            <Text style={styles.fieldLabel}>Limit Price (₹)</Text>
            <View style={styles.inputBox}>
              <Text style={styles.rupeeSign}>₹</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                editable={!loading}
              />
            </View>
          </View>
        )}

        {/* Stop-loss Toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.fieldLabel}>Intraday Stop-loss</Text>
            <Text style={styles.fieldSubLabel}>Trigger automated exit on adverse moves</Text>
          </View>
          <Switch
            value={stopLoss}
            onValueChange={setStopLoss}
            trackColor={{ false: '#e2e8f0', true: colors.primary }}
            disabled={loading}
          />
        </View>

        {/* Margin Required Row */}
        <View style={styles.marginRow}>
          <Text style={styles.marginLabel}>Estimated Margin Required</Text>
          <Text style={styles.marginVal}>
            ₹{marginRequired.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.actionBtn,
            isHalted ? { backgroundColor: '#64748b' } : { backgroundColor: isBuy ? '#1A73E8' : '#ef4444' },
            (loading || isHalted) && { opacity: 0.7 }
          ]}
          onPress={handleExecuteTrade}
          disabled={loading || isHalted}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : isHalted ? (
            <Text style={styles.actionBtnText}>Trading Halted</Text>
          ) : (
            <Text style={styles.actionBtnText}>
              {isBuy ? 'Place BUY Order' : 'Place SELL Order'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Simulated institutional trade. Executes instantly on live virtual book.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c',
  },

  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentBtnActiveBuy: {
    backgroundColor: '#eff6ff',
  },
  segmentBtnActiveSell: {
    backgroundColor: '#fef2f2',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
  },
  segmentTextActiveBuy: {
    color: '#1A73E8',
  },
  segmentTextActiveSell: {
    color: '#ef4444',
  },

  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  fieldSubLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  stepBtn: {
    padding: 8,
  },
  stepVal: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 14,
    minWidth: 60,
    textAlign: 'center',
    color: '#0f172a',
  },

  typeSegmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 14,
  },
  typeSegmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  typeSegmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  typeSegmentText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  typeSegmentTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },

  inputWrap: {
    marginBottom: 12,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    marginTop: 6,
    paddingBottom: 4,
  },
  rupeeSign: {
    fontSize: 16,
    color: '#0f172a',
    marginRight: 4,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '700',
    padding: 0,
  },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 14,
  },

  marginRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  marginLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  marginVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },

  actionBtn: {
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  disclaimer: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
  }
});
