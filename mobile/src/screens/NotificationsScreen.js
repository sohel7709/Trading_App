/**
 * NotificationsScreen.js
 * ──────────────────────
 * Real-time institutional alert center for students.
 * Displays trade executions, risk limit warnings, and capital assignments.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { api } from '../api/client';
import useSocket from '../hooks/useSocket';

const formatTimeAgo = (dateInput) => {
  if (!dateInput) return 'Just now';
  const now = new Date();
  const d = new Date(dateInput);
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function NotificationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('ALL'); // ALL, RISK, TRADE, CAPITAL

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.getNotifications();
      if (Array.isArray(res)) {
        setNotifications(res);
      }
    } catch (e) {
      console.warn('Notifications fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-refresh notifications when screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  // Live Socket listener
  useSocket('notification', (notif) => {
    setNotifications(prev => [notif, ...prev]);
  });

  useSocket('risk_alert', (alert) => {
    const newNotif = {
      _id: alert._id || Date.now().toString(),
      type: 'RISK',
      title: 'Risk Warning',
      message: alert.message || 'Risk threshold approaching',
      createdAt: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [newNotif, ...prev]);
  });

  const handleMarkAllRead = async () => {
    try {
      await api.markNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.warn('Failed to mark read:', e.message);
    }
  };

  const filteredList = notifications.filter(n => {
    if (filter === 'RISK') return n.type === 'RISK';
    if (filter === 'TRADE') return n.type === 'TRADE';
    if (filter === 'CAPITAL') return n.type === 'CAPITAL' || n.type === 'WALLET';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const renderItem = ({ item }) => {
    const isRisk = item.type === 'RISK';
    const isTrade = item.type === 'TRADE';
    const isCapital = item.type === 'CAPITAL' || item.type === 'WALLET';

    const iconName = isRisk
      ? 'warning-outline'
      : isTrade
      ? 'swap-horizontal-outline'
      : isCapital
      ? 'wallet-outline'
      : 'notifications-outline';

    const iconColor = isRisk ? colors.loss : isTrade ? colors.gain : '#2563eb';
    const iconBg = isRisk ? '#fee2e2' : isTrade ? '#dcfce7' : '#eff6ff';

    return (
      <View style={[styles.card, !item.read && styles.cardUnread]}>
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>
        <View style={styles.contentWrap}>
          <View style={styles.cardTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.cardTitle}>{item.title || 'Alert'}</Text>
              {!item.read && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.timeText}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.cardMessage}>{item.message}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={styles.unreadSub}>{unreadCount} unread alert{unreadCount !== 1 ? 's' : ''}</Text>
            )}
          </View>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markReadBtn} onPress={handleMarkAllRead}>
            <Text style={styles.markReadText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {[
          { key: 'ALL', label: 'All' },
          { key: 'RISK', label: 'Risk Alerts' },
          { key: 'TRADE', label: 'Trades' },
          { key: 'CAPITAL', label: 'Capital' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, filter === tab.key && styles.tabBtnActive]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[styles.tabText, filter === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Notification List */}
      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : filteredList.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-off-outline" size={32} color="#94a3b8" />
          </View>
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptySub}>
            You will receive live alerts when trades execute or risk warnings occur.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={item => item._id || item.id || Math.random().toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
              colors={[colors.primary]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  unreadSub: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  markReadBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  markReadText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: {
    backgroundColor: '#0F172A',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  cardUnread: {
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentWrap: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  cardMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
});
