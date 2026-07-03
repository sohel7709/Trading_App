import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

const CYCLE_SECONDS = 30;

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Kite-web login code — a fresh 6-digit code every 30s, shown as a bottom
// sheet over whichever screen requested it (matches the real Account →
// App Code flow).
export default function AppCodeSheet({ visible, onClose }) {
  const [code, setCode] = useState(genCode);
  const [secondsLeft, setSecondsLeft] = useState(CYCLE_SECONDS);
  const insets = useSafeAreaInsets();
  const intervalRef = useRef(null);

  const startCycle = useCallback(() => {
    clearInterval(intervalRef.current);
    setCode(genCode());
    setSecondsLeft(CYCLE_SECONDS);
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          setCode(genCode());
          return CYCLE_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (visible) startCycle();
    else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [visible, startCycle]);

  const elapsedPct = ((CYCLE_SECONDS - secondsLeft) / CYCLE_SECONDS) * 100;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* flex + justifyContent:'flex-end' docks the sheet to the bottom edge;
          without this wrapper the sheet renders at the top of the modal. */}
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
          <View style={styles.handle} />

          <Text style={styles.title}>App Code</Text>
          <Text style={styles.subtitle}>Enter this code to login to Kite web</Text>

          <Text style={styles.code}>
            {code.slice(0, 3)}{'  '}{code.slice(3, 6)}
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${elapsedPct}%` }]} />
          </View>

          <Text style={styles.changesTxt}>
            Changes in <Text style={styles.changesNum}>{secondsLeft}s</Text>
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB', marginBottom: 22,
  },
  title: { fontSize: 19, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' },
  code: {
    fontSize: 34, fontWeight: '700', color: colors.text,
    letterSpacing: 4, marginTop: 26,
  },
  progressTrack: {
    width: '100%', height: 3, borderRadius: 2,
    backgroundColor: '#E5E7EB', marginTop: 22, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  changesTxt: { fontSize: 13, color: colors.textSecondary, marginTop: 14 },
  changesNum: { color: colors.primary, fontWeight: '700' },
});
