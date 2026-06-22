import React, { Suspense } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme/colors';

// Tab-root screens load eagerly (shown immediately on launch)
import DashboardScreen from '../screens/DashboardScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import OrdersScreen from '../screens/OrdersScreen';
import BidsScreen from '../screens/BidsScreen';
import AccountScreen from '../screens/AccountScreen';
import MarketsScreen from '../screens/MarketsScreen';

// Pushed screens load lazily — their module code (and heavy chart/option-chain
// rendering) is only parsed when the user first navigates to them. This shrinks
// the initial JS bundle executed at startup, so the app opens faster.
function lazyScreen(factory) {
  const C = React.lazy(factory);
  return function LazyScreen(props) {
    return (
      <Suspense fallback={<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}><ActivityIndicator color={colors.primary} /></View>}>
        <C {...props} />
      </Suspense>
    );
  };
}

const StockDetailScreen = lazyScreen(() => import('../screens/StockDetailScreen'));
const AlertsScreen      = lazyScreen(() => import('../screens/AlertsScreen'));
const FundsScreen       = lazyScreen(() => import('../screens/FundsScreen'));
const GTTScreen         = lazyScreen(() => import('../screens/GTTScreen'));
const WithdrawScreen    = lazyScreen(() => import('../screens/WithdrawScreen'));
const AddFundsScreen    = lazyScreen(() => import('../screens/AddFundsScreen'));
const OrderEntryScreen  = lazyScreen(() => import('../screens/OrderEntryScreen'));
const OptionChainScreen = lazyScreen(() => import('../screens/OptionChainScreen'));
const IndexChartScreen  = lazyScreen(() => import('../screens/IndexChartScreen'));
const PLScreen          = lazyScreen(() => import('../screens/PLScreen'));
const ProfileScreen     = lazyScreen(() => import('../screens/ProfileScreen'));

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const USER_CODE = 'TG3140';

function TabLabel({ icon, iconOutline, focused, label, isAccount }) {
  if (isAccount) {
    return (
      <View style={tabStyles.container}>
        <View style={[tabStyles.accountCircle, focused && tabStyles.accountCircleActive]}>
          <Text style={[tabStyles.accountCode, focused && tabStyles.accountCodeActive]}>
            AW
          </Text>
        </View>
        <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>{USER_CODE}</Text>
      </View>
    );
  }
  return (
    <View style={tabStyles.container}>
      <Ionicons
        name={focused ? icon : iconOutline}
        size={22}
        color={focused ? '#387ED1' : '#9CA3AF'}
      />
      <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>{label}</Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: 1, paddingTop: 2 },
  label: { fontSize: 10, color: '#9CA3AF', fontWeight: '500', letterSpacing: 0.1 },
  labelActive: { color: '#387ED1', fontWeight: '600' },
  accountCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#E8EAED',
    justifyContent: 'center', alignItems: 'center',
  },
  accountCircleActive: { backgroundColor: '#387ED1' },
  accountCode: { fontSize: 7, fontWeight: '800', color: '#738390', letterSpacing: -0.5 },
  accountCodeActive: { color: '#fff' },
});

// Watchlist Stack
function WatchlistStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WatchlistHome" component={DashboardScreen} />
      <Stack.Screen name="StockDetail" component={StockDetailScreen} />
      <Stack.Screen name="OrderEntry" component={OrderEntryScreen} />
      <Stack.Screen name="OptionChain" component={OptionChainScreen} />
      <Stack.Screen name="IndexChart" component={IndexChartScreen} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen name="Funds" component={FundsScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
      <Stack.Screen name="AddFunds" component={AddFundsScreen} />
    </Stack.Navigator>
  );
}

// Markets Stack
function MarketsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MarketsHome" component={MarketsScreen} />
      <Stack.Screen name="StockDetail" component={StockDetailScreen} />
      <Stack.Screen name="OrderEntry" component={OrderEntryScreen} />
      <Stack.Screen name="OptionChain" component={OptionChainScreen} />
      <Stack.Screen name="IndexChart" component={IndexChartScreen} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen name="Funds" component={FundsScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
      <Stack.Screen name="AddFunds" component={AddFundsScreen} />
    </Stack.Navigator>
  );
}

// Orders Stack
function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OrdersHome" component={OrdersScreen} />
      <Stack.Screen name="GTT" component={GTTScreen} />
      <Stack.Screen name="StockDetail" component={StockDetailScreen} />
      <Stack.Screen name="OrderEntry" component={OrderEntryScreen} />
      <Stack.Screen name="OptionChain" component={OptionChainScreen} />
      <Stack.Screen name="IndexChart" component={IndexChartScreen} />
    </Stack.Navigator>
  );
}

// Portfolio Stack
function PortfolioStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PortfolioHome" component={PortfolioScreen} />
      <Stack.Screen name="StockDetail" component={StockDetailScreen} />
      <Stack.Screen name="OrderEntry" component={OrderEntryScreen} />
      <Stack.Screen name="OptionChain" component={OptionChainScreen} />
      <Stack.Screen name="IndexChart" component={IndexChartScreen} />
      <Stack.Screen name="PL" component={PLScreen} />
    </Stack.Navigator>
  );
}

// Bids Stack
function BidsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BidsHome" component={BidsScreen} />
    </Stack.Navigator>
  );
}

// Account Stack
function AccountStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AccountHome" component={AccountScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Funds" component={FundsScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
      <Stack.Screen name="AddFunds" component={AddFundsScreen} />
      <Stack.Screen name="Portfolio" component={PortfolioScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
      <Stack.Screen name="GTT" component={GTTScreen} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen name="StockDetail" component={StockDetailScreen} />
      <Stack.Screen name="OrderEntry" component={OrderEntryScreen} />
      <Stack.Screen name="PL" component={PLScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E8E8E8',
          height: 56,
          paddingBottom: 4,
          paddingTop: 4,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Watchlist"
        component={WatchlistStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabLabel icon="bookmark" iconOutline="bookmark-outline" focused={focused} label="Watchlist" />
          ),
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabLabel icon="receipt" iconOutline="receipt-outline" focused={focused} label="Orders" />
          ),
        }}
      />
      <Tab.Screen
        name="Portfolio"
        component={PortfolioStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabLabel icon="briefcase" iconOutline="briefcase-outline" focused={focused} label="Portfolio" />
          ),
        }}
      />
      <Tab.Screen
        name="Bids"
        component={BidsStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabLabel icon="pricetag" iconOutline="pricetag-outline" focused={focused} label="Bids" />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabLabel focused={focused} isAccount />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
