import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

export default function StockActionSheet({
  visible, onClose, stock,
  onBuy, onSell, onViewChart,
}) {
  const slideAnim = useRef(new Animated.Value(500)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 500,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!stock) return null;

  const {
    symbol = '',
    exchange = 'NSE',
    ltp = 0,
    change = 0,
    changePercent = 0,
  } = stock;

  const isGain = change >= 0;
  const changeColor = isGain ? colors.gain : colors.loss;
  const ltpFormatted = Number(ltp).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const changeSign = isGain ? '+' : '';
  const changeFormatted = `${changeSign}${Number(change).toFixed(2)}  (${changeSign}${Number(changePercent).toFixed(2)}%)`;

  // Simulated market depth rows
  const depthRows = [
    { bid: (ltp - 0.05).toFixed(2), bidQty: 247, offer: (ltp + 0.05).toFixed(2), offerQty: 183 },
    { bid: (ltp - 0.10).toFixed(2), bidQty: 512, offer: (ltp + 0.10).toFixed(2), offerQty: 321 },
    { bid: (ltp - 0.15).toFixed(2), bidQty: 180, offer: (ltp + 0.15).toFixed(2), offerQty: 94 },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Scrim */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
        />

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 10, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Stock header: name + price */}
          <View style={styles.stockHeader}>
            <View style={styles.stockTitleRow}>
              <Text style={styles.stockName}>{symbol}</Text>
              <View style={styles.exchangePill}>
                <Text style={styles.exchangePillText}>{exchange}</Text>
              </View>
            </View>
            <View style={styles.priceRow}>
              <Text style={[styles.ltp, { color: changeColor }]}>{ltpFormatted}</Text>
              <Text style={[styles.changeText, { color: changeColor }]}>{changeFormatted}</Text>
            </View>
          </View>

          {/* BUY / SELL primary CTAs */}
          <View style={styles.bsRow}>
            <TouchableOpacity style={styles.buyBtn} onPress={onBuy} activeOpacity={0.85}>
              <Text style={styles.bsBtnLabel}>BUY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sellBtn} onPress={onSell} activeOpacity={0.85}>
              <Text style={styles.bsBtnLabel}>SELL</Text>
            </TouchableOpacity>
          </View>

          {/* Quick links row */}
          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={onViewChart} activeOpacity={0.7}>
              <Ionicons name="stats-chart-outline" size={17} color={colors.primary} />
              <Text style={styles.quickBtnText}>View chart</Text>
            </TouchableOpacity>
            <View style={styles.quickDivider} />
            <TouchableOpacity style={styles.quickBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="list-outline" size={17} color={colors.primary} />
              <Text style={styles.quickBtnText}>Option chain</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.separator} />

          {/* Secondary actions */}
          <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Set alert</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Add notes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="git-branch-outline" size={20} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Create GTT</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.separator} />

          {/* Market depth */}
          <View style={styles.depthSection}>
            {/* Header */}
            <View style={styles.depthHeaderRow}>
              <Text style={[styles.depthHeaderCell, { color: colors.gain, flex: 1.2, textAlign: 'left' }]}>Bid</Text>
              <Text style={[styles.depthHeaderCell, { textAlign: 'center' }]}>Orders</Text>
              <Text style={[styles.depthHeaderCell, { textAlign: 'right' }]}>Qty</Text>
              <Text style={[styles.depthHeaderCell, { color: colors.loss, flex: 1.2, textAlign: 'left', paddingLeft: 12 }]}>Offer</Text>
              <Text style={[styles.depthHeaderCell, { textAlign: 'center' }]}>Orders</Text>
              <Text style={[styles.depthHeaderCell, { textAlign: 'right' }]}>Qty</Text>
            </View>
            {depthRows.map((row, i) => (
              <View key={i} style={styles.depthDataRow}>
                <Text style={[styles.depthVal, { color: colors.gain, flex: 1.2, textAlign: 'left' }]}>{row.bid}</Text>
                <Text style={[styles.depthVal, { textAlign: 'center' }]}>1</Text>
                <Text style={[styles.depthVal, { textAlign: 'right' }]}>{row.bidQty}</Text>
                <Text style={[styles.depthVal, { color: colors.loss, flex: 1.2, textAlign: 'left', paddingLeft: 12 }]}>{row.offer}</Text>
                <Text style={[styles.depthVal, { textAlign: 'center' }]}>1</Text>
                <Text style={[styles.depthVal, { textAlign: 'right' }]}>{row.offerQty}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // ── Sheet ─────────────────────────────────────────────────────────────────
  sheet: {
    backgroundColor: colors.surface,      // #FFFFFF — flat, no shadow
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 16,
  },

  // ── Stock header ──────────────────────────────────────────────────────────
  stockHeader: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  stockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  stockName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  exchangePill: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#EFF6FF',
  },
  exchangePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 0.2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  ltp: {
    fontSize: 20,
    fontWeight: '700',
  },
  changeText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // ── BUY / SELL ────────────────────────────────────────────────────────────
  bsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  buyBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: colors.gain,         // #25B87E
    alignItems: 'center',
  },
  sellBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: colors.loss,         // #E64D3D
    alignItems: 'center',
  },
  bsBtnLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  // ── Quick links ───────────────────────────────────────────────────────────
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickBtnText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  quickDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.borderLight,
    marginHorizontal: 8,
  },

  // ── Separator ─────────────────────────────────────────────────────────────
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,  // #F1F3F4
    marginVertical: 4,
  },

  // ── Secondary actions ─────────────────────────────────────────────────────
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryBtn: {
    alignItems: 'center',
    gap: 5,
  },
  secondaryBtnText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },

  // ── Market depth ──────────────────────────────────────────────────────────
  depthSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  depthHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  depthHeaderCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  depthDataRow: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  depthVal: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
  },
});
