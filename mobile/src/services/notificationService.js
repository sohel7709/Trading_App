import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'app_settings_v1';

async function notificationsEnabled() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return false;
    const settings = JSON.parse(raw);
    return !!settings.orderNotifications;
  } catch {
    return false;
  }
}

export async function notify(title, body) {
  if (!(await notificationsEnabled())) return;
  console.log('[TradeLab Notification]', title, body);
}

const inr = (n) => {
  const num = Number(n ?? 0);
  try {
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return num.toFixed(2);
  }
};

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
