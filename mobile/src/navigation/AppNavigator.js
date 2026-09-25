/**
 * AppNavigator.js (Production - Zero Lazy Imports)
 * ─────────────────────────────────────────────────────────
 * Institutional Student App Navigation:
 * - 5 Core Bottom Tabs:
 *     1. Watchlist  (Live Market Watchlist — default landing screen)
 *     2. Trade      (Live Option Chain & Order Execution)
 *     3. Orders     (Order Book & History)
 *     4. Portfolio  (Open Positions & Closed Trades)
 *     5. Profile    (Capital summary, PnL stats, Batch & Settings)
 *
 * All screens are statically imported to eliminate Metro bundler
 * dynamic chunk resolution errors (e.g. "cannot read property reload").
 * DashboardScreen is retained as an accessible screen inside stacks
 * but is no longer the root tab — Watchlist is Tab 1.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// ── Static Screen Imports (100% Reliable in Metro) ───────────────────────────
import DashboardScreen from '../screens/DashboardScreen'; // kept for deep-link access
import PortfolioScreen from '../screens/PortfolioScreen';
import OptionChainScreen from '../screens/OptionChainScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import TradeJournalScreen from '../screens/TradeJournalScreen';
import FundsScreen from '../screens/FundsScreen';
import OrderEntryScreen from '../screens/OrderEntryScreen';
import StockDetailScreen from '../screens/StockDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import OrdersScreen from '../screens/OrdersScreen';
import IndexChartScreen from '../screens/IndexChartScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ── Shared Stack Options with Smooth Native Transitions ───────────────────────
const screenOptions = {
  headerShown: false,
  animation: 'slide_from_right',
  animationDuration: 220,
};

// ── 1. Watchlist Stack (NEW TAB 1 — replaces Home/Dashboard) ─────────────────
function WatchlistStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="WatchlistMain"  component={WatchlistScreen} />
      <Stack.Screen name="StockDetail"    component={StockDetailScreen} />
      <Stack.Screen name="Orders"         component={OrdersScreen} />
      <Stack.Screen name="Chain"          component={OptionChainScreen} />
      <Stack.Screen name="OptionChain"    component={OptionChainScreen} />
      <Stack.Screen name="Trade"          component={OptionChainScreen} />
      <Stack.Screen name="OrderEntry"     component={OrderEntryScreen} />
      <Stack.Screen name="Analytics"      component={AnalyticsScreen} />
      <Stack.Screen name="Funds"          component={FundsScreen} />
      <Stack.Screen name="TradeJournal"   component={TradeJournalScreen} />
      <Stack.Screen name="Positions"      component={PortfolioScreen} />
      <Stack.Screen name="IndexChart"     component={IndexChartScreen} />
      <Stack.Screen name="Dashboard"      component={DashboardScreen} />
    </Stack.Navigator>
  );
}

// ── 2. Trade Stack (Option Chain & Execution) ─────────────────────────────────
function TradeStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ChainMain"      component={OptionChainScreen} />
      <Stack.Screen name="Chain"          component={OptionChainScreen} />
      <Stack.Screen name="OptionChain"    component={OptionChainScreen} />
      <Stack.Screen name="Orders"         component={OrdersScreen} />
      <Stack.Screen name="OrderEntry"     component={OrderEntryScreen} />
      <Stack.Screen name="StockDetail"    component={StockDetailScreen} />
      <Stack.Screen name="Positions"      component={PortfolioScreen} />
      <Stack.Screen name="IndexChart"     component={IndexChartScreen} />
    </Stack.Navigator>
  );
}

// ── 3. Orders Stack ───────────────────────────────────────────────────────────
function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="OrdersMain"     component={OrdersScreen} />
      <Stack.Screen name="OrderEntry"     component={OrderEntryScreen} />
      <Stack.Screen name="StockDetail"    component={StockDetailScreen} />
      <Stack.Screen name="Chain"          component={OptionChainScreen} />
      <Stack.Screen name="OptionChain"    component={OptionChainScreen} />
      <Stack.Screen name="Trade"          component={OptionChainScreen} />
      <Stack.Screen name="Positions"      component={PortfolioScreen} />
      <Stack.Screen name="IndexChart"     component={IndexChartScreen} />
    </Stack.Navigator>
  );
}

// ── 4. Portfolio Stack ────────────────────────────────────────────────────────
function PortfolioStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="PositionsMain"  component={PortfolioScreen} />
      <Stack.Screen name="Orders"         component={OrdersScreen} />
      <Stack.Screen name="Chain"          component={OptionChainScreen} />
      <Stack.Screen name="OptionChain"    component={OptionChainScreen} />
      <Stack.Screen name="Trade"          component={OptionChainScreen} />
      <Stack.Screen name="OrderEntry"     component={OrderEntryScreen} />
      <Stack.Screen name="TradeJournal"   component={TradeJournalScreen} />
      <Stack.Screen name="Analytics"      component={AnalyticsScreen} />
      <Stack.Screen name="Watchlist"      component={WatchlistScreen} />
      <Stack.Screen name="IndexChart"     component={IndexChartScreen} />
    </Stack.Navigator>
  );
}

// ── 5. Profile Stack ──────────────────────────────────────────────────────────
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ProfileMain"    component={ProfileScreen} />
      <Stack.Screen name="Orders"         component={OrdersScreen} />
      <Stack.Screen name="Analytics"      component={AnalyticsScreen} />
      <Stack.Screen name="TradeJournal"   component={TradeJournalScreen} />
      <Stack.Screen name="Funds"          component={FundsScreen} />
      <Stack.Screen name="Notifications"  component={NotificationsScreen} />
      <Stack.Screen name="Chat"           component={ChatScreen} />
      <Stack.Screen name="Watchlist"      component={WatchlistScreen} />
      <Stack.Screen name="Positions"      component={PortfolioScreen} />
    </Stack.Navigator>
  );
}

// ── Tab Bar Icon Helper (Neat & Clean Fintech Active Pill) ─────────────────────
function TabIcon({ icon, iconOutline, focused, label, badge }) {
  return (
    <View style={tabStyles.wrap}>
      <View style={[tabStyles.iconBox, focused && tabStyles.iconBoxActive]}>
        <Ionicons
          name={focused ? icon : iconOutline}
          size={focused ? 21 : 20}
          color={focused ? colors.primary : '#64748B'}
        />
        {badge > 0 && (
          <View style={tabStyles.badge}>
            <Text style={tabStyles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>{label}</Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', minWidth: 64 },
  iconBox: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxActive: {
    backgroundColor: '#EFF6FF',
  },
  label: { fontSize: 11, color: '#64748B', fontWeight: '500', marginTop: 2, letterSpacing: -0.1 },
  labelActive: { color: colors.primary, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.loss,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});

// ── Main Tab Navigator ────────────────────────────────────────────────────────
export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#F1F5F9',
          height: Platform.OS === 'ios' ? 84 : 68,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          elevation: 8,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
        },
        tabBarShowLabel: false,
      }}
    >
      {/* Tab 1: Watchlist — default landing screen */}
      <Tab.Screen
        name="Watchlist"
        component={WatchlistStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="bookmark" iconOutline="bookmark-outline" focused={focused} label="Watchlist" />
          ),
        }}
      />

      {/* Tab 2: Trade — Live Option Chain & Order Execution */}
      <Tab.Screen
        name="Trade"
        component={TradeStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="bar-chart" iconOutline="bar-chart-outline" focused={focused} label="Trade" />
          ),
        }}
      />

      {/* Tab 3: Orders — Order Book & History */}
      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="receipt" iconOutline="receipt-outline" focused={focused} label="Orders" />
          ),
        }}
      />

      {/* Tab 4: Portfolio — Open Positions & Closed Trades */}
      <Tab.Screen
        name="Positions"
        component={PortfolioStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="pie-chart" iconOutline="pie-chart-outline" focused={focused} label="Portfolio" />
          ),
        }}
      />

      {/* Tab 5: Profile — Capital summary, PnL stats, Batch & Settings */}
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="person" iconOutline="person-outline" focused={focused} label="Profile" />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

