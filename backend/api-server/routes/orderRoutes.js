'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authenticate');
const { OrdersModel, TradeModel } = require('../../shared/db');
const redis = require('../../shared/redis');
const CacheService = require('../../services/cacheService');
const orderEngine = require('../../orderEngine');

// GET /allOrders or /orders (Supports ?page=1&limit=20 pagination + .lean())
router.get(['/allOrders', '/orders'], authenticate, async (req, res) => {
    try {
        const query = { userId: req.user._id };
        if (req.query.status) {
            query.status = req.query.status.toUpperCase();
        }

        const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10)) : null;
        const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10))) : (page ? 20 : 100);

        if (page) {
            const skip = (page - 1) * limit;
            const [orders, total] = await Promise.all([
                OrdersModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
                OrdersModel.countDocuments(query)
            ]);
            return res.status(200).json({
                data: orders,
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            });
        }

        const orders = await OrdersModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();
        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching orders', error: err.message });
    }
});

// GET /trades (Supports ?page=1&limit=20 pagination + .lean())
router.get('/trades', authenticate, async (req, res) => {
    try {
        const query = { userId: req.user._id };
        const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10)) : null;
        const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10))) : (page ? 20 : 100);

        if (page) {
            const skip = (page - 1) * limit;
            const [trades, total] = await Promise.all([
                TradeModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
                TradeModel.countDocuments(query)
            ]);
            return res.status(200).json({
                data: trades,
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            });
        }

        const trades = await TradeModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();
        res.status(200).json(trades);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching trades', error: err.message });
    }
});

// POST /trade or /newOrder - Place Equity Order
router.post(['/trade', '/newOrder'], authenticate, async (req, res) => {
    try {
        const { stockSymbol, symbol, quantity, qty, price, type, mode, side, productType } = req.body;
        const finalSymbol = (stockSymbol || symbol || '').toUpperCase();
        const finalQty = Number(quantity || qty || 1);
        const finalType = (type || mode || 'MARKET').toUpperCase();
        const finalSide = (side || 'BUY').toUpperCase();
        const finalProductType = (productType || 'MIS').toUpperCase();

        if (!finalSymbol) return res.status(400).json({ message: 'Symbol is required' });

        // Get latest price from Redis
        const cached = await redis.getPrice(finalSymbol);
        const execPrice = finalType === 'LIMIT' ? Number(price) : Number(cached?.ltp || price || 0);
        if (!execPrice || execPrice <= 0) {
            return res.status(422).json({ message: 'Live price not available yet. Please retry in a moment.' });
        }

        const result = await orderEngine.placeOrder(req.user._id, {
            stockSymbol: finalSymbol,
            quantity: finalQty,
            price: execPrice,
            type: finalType,
            side: finalSide,
            productType: finalProductType,
        });

        // 1. Invalidate Redis portfolio cache
        CacheService.invalidatePortfolio(req.user._id.toString()).catch(() => {});

        // 2. Publish orderExecuted event over Redis Pub/Sub to all Socket Servers
        redis.publishOrderUpdate(req.user._id.toString(), 'orderExecuted', {
            order: result.order,
            trade: result.trade,
        });

        res.status(201).json({
            message: 'Order placed successfully',
            order: result.order,
            trade: result.trade,
        });
    } catch (err) {
        if (err instanceof orderEngine.OrderRejectedError) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: 'Error creating trade', error: err.message });
    }
});

// DELETE /orders/:id - Cancel resting order
router.delete('/orders/:id', authenticate, async (req, res) => {
    try {
        const order = await OrdersModel.findOne({ _id: req.params.id, userId: req.user._id });
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.status !== 'PENDING' && order.status !== 'TRIGGER_PENDING') {
            return res.status(400).json({ message: `Cannot cancel an order with status "${order.status}"` });
        }

        order.status = 'CANCELLED';
        order.cancelledAt = new Date();
        await order.save();

        if (order.side === 'BUY') {
            await orderEngine.recomputeBlockedMargin(req.user._id);
        }

        CacheService.invalidatePortfolio(req.user._id.toString()).catch(() => {});
        redis.publishOrderUpdate(req.user._id.toString(), 'orderCancelled', { order });

        res.status(200).json({ message: 'Order cancelled successfully', order });
    } catch (err) {
        res.status(500).json({ message: 'Error cancelling order', error: err.message });
    }
});

module.exports = router;
