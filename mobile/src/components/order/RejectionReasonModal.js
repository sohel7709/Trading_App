/**
 * RejectionReasonModal.js
 * ────────────────────────
 * Educational modal shown when an order is rejected.
 * Displays the rejection reason clearly with a teaching-oriented explanation.
 *
 * Props:
 *   visible   {boolean}
 *   reason    {string}   Raw rejection message from backend
 *   onClose   {() => void}
 *   orderInfo {{ side, symbol, lots }}  Optional order context for display
 */

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

// ── Rejection reason → educational explanation map ───────────────────────────
// Matches common rejection reasons from the backend order engine.
const EDUCATIONAL_MAP = [
  {
    match: /insufficient.*margin|not enough.*margin|margin.*insufficient/i,
    icon: 'wallet-outline',
    title: 'Insufficient Margin',
    tip: 'Your available margin is too low to open this position. In real markets, brokers require a margin deposit to ensure you can cover potential losses. Try reducing the number of lots or square off an existing position first.',
  },
  {
    match: /max.*loss|daily.*loss.*limit|loss.*limit/i,
    icon: 'warning-outline',
    title: 'Daily Loss Limit Reached',
    tip: 'Your instructor has set a maximum daily loss limit. This is a common risk management rule in professional trading desks. Once you hit this limit, no new positions can be opened for the day.',
  },
  {
    match: /max.*position|too many.*position|position.*limit/i,
    icon: 'layers-outline',
    title: 'Position Limit Exceeded',
    tip: 'You have reached the maximum number of open positions allowed by your instructor\'s risk rules. Professionals limit concurrent positions to maintain focus and control portfolio risk.',
  },
  {
    match: /market.*closed|session.*not.*active|trading.*not.*open/i,
    icon: 'time-outline',
    title: 'Market / Session Closed',
    tip: 'Trading is not currently active. Your instructor controls when the simulated market session opens and closes. Wait for the session to resume.',
  },
  {
    match: /stop.?loss.*required|mandatory.*sl/i,
    icon: 'shield-outline',
    title: 'Stop-Loss Required',
    tip: 'Your instructor has enabled mandatory stop-loss for all trades. Professional traders always define their maximum loss before entering a position. Add a stop-loss order to proceed.',
  },
  {
    match: /leverage|lot.*size|quantity.*invalid/i,
    icon: 'trending-up-outline',
    title: 'Leverage / Quantity Invalid',
    tip: 'The quantity or leverage you entered exceeds the allowed limit. Check the lot size and your margin rules.',
  },
  {
    match: /segment.*not.*allowed|fno.*not.*allowed|equity.*not.*allowed/i,
    icon: 'ban-outline',
    title: 'Segment Not Allowed',
    tip: 'Your instructor has restricted trading to specific market segments. Check the allowed segments in your batch settings.',
  },
];

function getEducationalContext(reason = '') {
  const reasonStr = typeof reason === 'string' ? reason : (reason?.message || reason?.error || '');
  for (const entry of EDUCATIONAL_MAP) {
    if (entry.match.test(reasonStr)) return entry;
  }
  // Default fallback
  return {
    icon: 'close-circle-outline',
    title: 'Order Rejected',
    tip: 'Your order was not placed. Review the reason above and check your order parameters, margin balance, and instructor-set risk rules.',
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RejectionReasonModal({
  visible,
  reason,
  onClose,
  orderInfo,
}) {
  const insets = useSafeAreaInsets();
  const safeReason = typeof reason === 'string'
    ? reason
    : (reason?.message || reason?.error || (reason ? JSON.stringify(reason) : 'Unknown error'));
  const ctx = getEducationalContext(safeReason);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.card, { marginBottom: insets.bottom + 20 }]}>
        {/* Top icon */}
        <View style={styles.iconWrap}>
          <Ionicons name={ctx.icon} size={36} color={colors.loss} />
        </View>

        <Text style={styles.title}>{ctx.title}</Text>

        {/* Order context badge */}
        {orderInfo && (
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeText}>
              {orderInfo.side || 'BUY'} · {orderInfo.symbol || 'Instrument'} · {orderInfo.lots || 1} lot{(orderInfo.lots || 1) !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Raw reason from backend */}
        <View style={styles.reasonBox}>
          <Ionicons name="alert-circle" size={14} color={colors.loss} style={{ marginTop: 1 }} />
          <Text style={styles.reasonText}>{safeReason}</Text>
        </View>

        {/* Educational tip */}
        <View style={styles.tipBox}>
          <Ionicons name="bulb-outline" size={16} color="#d97706" style={{ marginTop: 1 }} />
          <Text style={styles.tipText}>{ctx.tip}</Text>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.closeBtnText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  iconWrap: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20, fontWeight: '700', color: colors.text,
    marginBottom: 12, textAlign: 'center',
  },
  orderBadge: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    marginBottom: 16,
  },
  orderBadgeText: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  reasonBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fef2f2', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 12, width: '100%',
  },
  reasonText: {
    flex: 1, fontSize: 13, color: '#991b1b', fontWeight: '500', lineHeight: 20,
  },
  tipBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fffbeb', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 24, width: '100%',
    borderWidth: 1, borderColor: '#fde68a',
  },
  tipText: {
    flex: 1, fontSize: 13, color: '#78350f', lineHeight: 20,
  },
  closeBtn: {
    width: '100%',
    backgroundColor: colors.text,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff', fontSize: 16, fontWeight: '700',
  },
});
