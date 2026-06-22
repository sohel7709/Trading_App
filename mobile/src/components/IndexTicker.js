import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { api, getSocket } from '../api/client';

export default function IndexTicker({ indexes: propIndexes, onIndexPress }) {
  const [indexes, setIndexes] = useState({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Skip the network fetch when the parent already supplies indexes
    if (!propIndexes || Object.keys(propIndexes).length === 0) {
      api.getIndexes().then(res => {
        if (res?.indexes && Object.keys(res.indexes).length > 0) {
          setIndexes(res.indexes);
        }
      }).catch(() => {});
    }

    const socket = getSocket();
    const handler = (data) => {
      if (data.indexes && Object.keys(data.indexes).length > 0) {
        setIndexes(data.indexes);
      }
    };
    socket.on('marketData', handler);
    return () => socket.off('marketData', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (propIndexes && Object.keys(propIndexes).length > 0) {
      setIndexes(propIndexes);
    }
  }, [propIndexes]);

  const merged = Object.keys(indexes).length > 0 ? indexes : {
    'NIFTY 50':   { ltp: 22450.00, change: 135.25, changePercent: 0.56 },
    'BANK NIFTY': { ltp: 48250.15, change: 98.35,  changePercent: 0.20 },
  };

  const nifty50   = merged['NIFTY 50']   ?? merged['NIFTY50'];
  const niftyBank = merged['BANK NIFTY'] ?? merged['BANKNIFTY'];
  const sensex    = merged['SENSEX'];
  const niftyIT   = merged['NIFTY IT'];
  const finNifty  = merged['FINNIFTY'];

  const IndexItem = ({ name, data, compact }) => {
    const isGain = (data?.change ?? 0) >= 0;
    const ltp    = Number(data?.ltp ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const change = Number(data?.change ?? 0).toFixed(2);
    const pct    = Number(data?.changePercent ?? 0).toFixed(2);

    return (
      <TouchableOpacity
        style={compact ? styles.indexItemCompact : styles.indexItem}
        onPress={() => onIndexPress && onIndexPress(name)}
        disabled={!onIndexPress}
        activeOpacity={onIndexPress ? 0.7 : 1}
      >
        <Text style={styles.indexName}>{name}</Text>
        <Text style={[styles.indexLtp, { color: isGain ? colors.gain : colors.loss }]}>{ltp}</Text>
        <Text style={[styles.indexChange, { color: isGain ? colors.gain : colors.loss }]}>
          {isGain ? '+' : ''}{change} ({isGain ? '+' : ''}{pct}%)
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <TouchableOpacity style={styles.container} onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        <View style={styles.row}>
          {nifty50   && <IndexItem name="NIFTY 50"   data={nifty50} />}
          {niftyBank && <IndexItem name="BANK NIFTY" data={niftyBank} />}
          {sensex && !nifty50 && <IndexItem name="SENSEX" data={sensex} />}

          <View style={styles.rightGroup}>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
          </View>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.expandedContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.expandedRow}>
            {sensex   && <IndexItem name="SENSEX"   data={sensex}   compact />}
            {niftyIT  && <IndexItem name="NIFTY IT" data={niftyIT}  compact />}
            {finNifty && <IndexItem name="FINNIFTY" data={finNifty} compact />}
            {merged['INDIA VIX']     && <IndexItem name="INDIA VIX"   data={merged['INDIA VIX']}   compact />}
            {merged['NIFTY MIDCAP'] && <IndexItem name="MIDCAP"      data={merged['NIFTY MIDCAP']} compact />}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  indexItem: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  indexItemCompact: { marginRight: 20, alignItems: 'flex-start' },
  indexName: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginRight: 2 },
  indexLtp: { fontSize: 13, fontWeight: '700' },
  indexChange: { fontSize: 11, fontWeight: '400' },

  rightGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  expandedContainer: {
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  expandedRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 14 },
  sourceText: {
    fontSize: 10, color: colors.textMuted,
    marginTop: 6, paddingBottom: 2,
    textAlign: 'right',
  },
});
