import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureNotificationPermission } from '../utils/permissions';

const SETTINGS_KEY = 'app_settings_v1';

// Local (in-app) notifications for order fills, GTT/alert triggers, and
// EOD square-offs — no remote push server involved, just surfaces socket
// events as OS notifications so they're visible even if the app is backgrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function notificationsEnabled() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return false; // matches the Settings screen's default (off)
    const settings = JSON.parse(raw);
    return !!settings.orderNotifications;
  } catch {
    return false;
  }
}

export async function notify(title, body) {
  if (!(await notificationsEnabled())) return;
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // fire immediately
    });
  } catch (e) {
    console.warn('[Notifications] schedule failed:', e.message);
  }
}

const inr = (n) => Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Socket-event → notification copy, kept in one place so every screen's
// socket handler can stay focused on its own state updates.
export const notifyOrderExecuted = (order) => {
  if (!order) return;
  notify(
    `${order.side} order executed`,
    `${order.side} ${order.quantity} × ${order.stockSymbol} @ ₹${inr(order.price)}`
  );
};

export const notifyOrderRejected = (order, reason) => {
  if (!order) return;
  notify(`Order rejected — ${order.stockSymbol}`, reason || 'Your order could not be executed.');
};

export const notifyAlertTriggered = (alert) => {
  if (!alert) return;
  notify(
    alert.gtt ? `GTT triggered — ${alert.stockSymbol}` : `Price alert — ${alert.stockSymbol}`,
    alert.gtt
      ? `${alert.side} ${alert.quantity} × ${alert.stockSymbol} placed at your GTT trigger.`
      : `${alert.stockSymbol} crossed ${alert.condition} ₹${inr(alert.targetPrice)}`
  );
};

export const notifyMisSquaredOff = (count) => {
  if (!count) return;
  notify('Intraday positions squared off', `${count} MIS position${count > 1 ? 's' : ''} auto-closed at 3:20 PM.`);
};
