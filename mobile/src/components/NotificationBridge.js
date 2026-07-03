import { useEffect } from 'react';
import { getSocket } from '../api/client';
import {
  notifyOrderExecuted, notifyOrderRejected, notifyAlertTriggered, notifyMisSquaredOff,
} from '../services/notificationService';

// Mounted once at the app root (while logged in) — turns backend socket
// events into local device notifications, independent of which screen is
// currently focused. Renders nothing.
export default function NotificationBridge() {
  useEffect(() => {
    const socket = getSocket();

    const onOrderExecuted = (data) => notifyOrderExecuted(data?.order);
    const onOptionOrderExecuted = (data) => {
      if (!data) return;
      notifyOrderExecuted({ side: data.action, quantity: data.qty, stockSymbol: data.symbol, price: data.premium });
    };
    const onOrderRejected = (data) => notifyOrderRejected(data?.order, data?.reason);
    const onAlertTriggered = (data) => notifyAlertTriggered(data?.alert);
    const onMisSquaredOff = (data) => notifyMisSquaredOff(data?.count);

    socket.on('orderExecuted', onOrderExecuted);
    socket.on('optionOrderExecuted', onOptionOrderExecuted);
    socket.on('orderRejected', onOrderRejected);
    socket.on('alertTriggered', onAlertTriggered);
    socket.on('misSquaredOff', onMisSquaredOff);

    return () => {
      socket.off('orderExecuted', onOrderExecuted);
      socket.off('optionOrderExecuted', onOptionOrderExecuted);
      socket.off('orderRejected', onOrderRejected);
      socket.off('alertTriggered', onAlertTriggered);
      socket.off('misSquaredOff', onMisSquaredOff);
    };
  }, []);

  return null;
}
