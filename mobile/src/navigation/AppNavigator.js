/**
 * AppNavigator.js (Production - Zero Lazy Imports)
 * ─────────────────────────────────────────────────────────
 * Institutional Student App Navigation:
 * - 5 Core Bottom Tabs:
 *     1. Home (Real-time Dashboard)
 *     2. Trade (Live Option Chain & Order Execution)
 *     3. Portfolio (Open Positions & Closed Trades)
 *     4. Analytics (Interactive PnL Curve & Win Rates)
 *     5. Profile (Batch, Instructor & Institutional Settings)
 *
 * All screens are statically imported to eliminate Metro bundler
 * dynamic chunk resolution errors (e.g. "cannot read property reload").
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// ── Static Screen Imports (100% Reliable in Metro) ───────────────────────────
import DashboardScreen from '../screens/DashboardScreen';
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

// ── 1. Home Stack ─────────────────────────────────────────────────────────────
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="HomeMain"       component={DashboardScreen} />
      <Stack.Screen name="Chain"          component={OptionChainScreen} />
      <Stack.Screen name="OptionChain"    component={OptionChainScreen} />
      <Stack.Screen name="Trade"          component={OptionChainScreen} />
      <Stack.Screen name="Orders"         component={OrdersScreen} />
      <Stack.Screen name="Analytics"      component={AnalyticsScreen} />
      <Stack.Screen name="Notifications"  component={NotificationsScreen} />
      <Stack.Screen name="TradeJournal"   component={TradeJournalScreen} />
      <Stack.Screen name="Funds"          component={FundsScreen} />
      <Stack.Screen name="OrderEntry"     component={OrderEntryScreen} />
      <Stack.Screen name="StockDetail"    component={StockDetailScreen} />
      <Stack.Screen name="Chat"           component={ChatScreen} />
      <Stack.Screen name="Profile"        component={ProfileScreen} />
      <Stack.Screen name="Watchlist"      component={WatchlistScreen} />
      <Stack.Screen name="IndexChart"     component={IndexChartScreen} />
    </Stack.Navigator>
  );
}

// ── 2. Orders Stack ───────────────────────────────────────────────────────────
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

// ── 3. Trade Stack (Option Chain & Execution) ─────────────────────────────────
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

// ── 5. Watchlist Stack ────────────────────────────────────────────────────────
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
    </Stack.Navigator>
  );
}

// ── Analytics Stack (accessible via Profile & Home) ───────────────────────────
function AnalyticsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="AnalyticsMain"  component={AnalyticsScreen} />
      <Stack.Screen name="TradeJournal"   component={TradeJournalScreen} />
      <Stack.Screen name="Funds"          component={FundsScreen} />
      <Stack.Screen name="Orders"         component={OrdersScreen} />
    </Stack.Navigator>
  );
}

// ── 6. Profile Stack ──────────────────────────────────────────────────────────
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
      initialRouteName="Watchlist"
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
      <Tab.Screen
        name="Watchlist"
        component={WatchlistStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="bookmark" iconOutline="bookmark-outline" focused={focused} label="Watchlist" />
          ),
        }}
      />

      <Tab.Screen
        name="Options"
        component={TradeStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="trending-up" iconOutline="trending-up-outline" focused={focused} label="Options" />
          ),
        }}
      />

      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="receipt" iconOutline="receipt-outline" focused={focused} label="Orders" />
          ),
        }}
      />

      <Tab.Screen
        name="Portfolio"
        component={PortfolioStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="pie-chart" iconOutline="pie-chart-outline" focused={focused} label="Portfolio" />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="person" iconOutline="person-outline" focused={focused} label="Profile" />
          ),
        }}
      />

      {/* Hidden Aliases for backward-compatibility with existing stack routes */}
      <Tab.Screen
        name="Positions"
        component={PortfolioStack}
        options={{
          tabBarItemStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="Trade"
        component={TradeStack}
        options={{
          tabBarItemStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          tabBarItemStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarItemStyle: { display: 'none' },
        }}
      />
    </Tab.Navigator>
  );
}
