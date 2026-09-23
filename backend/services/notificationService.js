'use strict';

const { NotificationModel } = require('../model/NotificationModel');

class NotificationService {
    constructor() {
        this.io = null;
    }

    init(io) {
        this.io = io;
        console.log('[NotificationService] ✅ NotificationService initialized');
    }

    /**
     * Send in-app and push notification to a user
     */
    async sendNotification({
        userId,
        batchId = null,
        type = 'INFO', // 'RISK' | 'TRADE' | 'CAPITAL' | 'INFO' | 'MARKET' | 'GAMIFICATION'
        title,
        message,
        data = {},
    }) {
        if (!userId) return null;

        try {
            // 1. Persist to MongoDB
            const notif = new NotificationModel({
                userId,
                batchId,
                type: ['RISK', 'TRADE', 'CAPITAL', 'INFO'].includes(type) ? type : 'INFO',
                title,
                message,
                read: false,
                data: {
                    ...data,
                    subType: type,
                },
            });
            await notif.save();

            // 2. Real-time WebSocket emission to user private room
            if (this.io) {
                const uidStr = userId.toString();
                this.io.to(`user:${uidStr}`).emit('notification', {
                    _id: notif._id,
                    type,
                    title,
                    message,
                    read: false,
                    data: notif.data,
                    createdAt: notif.createdAt,
                });
            }

            // 3. Dispatch simulated/configured Push Notification (FCM / WebPush)
            await this._dispatchPush(userId, { title, message, data });

            return notif;
        } catch (err) {
            console.warn('[NotificationService] Failed to send notification:', err.message);
            return null;
        }
    }

    /**
     * Extensible Push notification gateway (FCM / Web Push)
     */
    async _dispatchPush(userId, { title, message, data }) {
        // Ready for Firebase Cloud Messaging (FCM) credentials:
        // if (process.env.FCM_SERVER_KEY) {
        //    admin.messaging().sendToDevice(userToken, { notification: { title, body: message }, data });
        // }
    }

    // Helper triggers
    async notifyOrderExecuted(userId, order, trade) {
        return this.sendNotification({
            userId,
            type: 'TRADE',
            title: `Order Executed: ${order.side} ${order.quantity} ${order.stockSymbol}`,
            message: `Your ${order.type} order for ${order.quantity} shares of ${order.stockSymbol} was executed at ₹${trade.price}.`,
            data: { orderId: order._id, tradeId: trade._id, symbol: order.stockSymbol },
        });
    }

    async notifyPriceAlert(userId, alert, ltp) {
        return this.sendNotification({
            userId,
            type: 'MARKET',
            title: `Price Alert: ${alert.stockSymbol}`,
            message: `${alert.stockSymbol} crossed your target of ₹${alert.targetPrice} (LTP: ₹${ltp}).`,
            data: { alertId: alert._id, symbol: alert.stockSymbol, ltp },
        });
    }

    async notifyBadgeUnlocked(userId, badge) {
        return this.sendNotification({
            userId,
            type: 'GAMIFICATION',
            title: `New Badge Unlocked: ${badge.name} ${badge.icon}`,
            message: `Congratulations! You unlocked the "${badge.name}" badge: ${badge.description}`,
            data: { badgeId: badge.id },
        });
    }

    async notifyRiskBreach(userId, reason) {
        return this.sendNotification({
            userId,
            type: 'RISK',
            title: 'Risk Rule Breach Alert',
            message: reason,
            data: { riskBreach: true },
        });
    }
}

const instance = new NotificationService();
instance.notificationService = instance;
instance.initNotificationSocket = (io) => instance.init(io);
instance.sendNotification = instance.sendNotification.bind(instance);

module.exports = instance;
module.exports.NotificationService = NotificationService;
module.exports.initNotificationSocket = (io) => instance.init(io);
module.exports.sendNotification = instance.sendNotification.bind(instance);
