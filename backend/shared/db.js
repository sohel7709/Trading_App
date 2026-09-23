'use strict';

const mongoose = require('mongoose');
const config = require('./config');

let isConnected = false;

async function connectDB() {
    if (isConnected) return mongoose.connection;
    try {
        await mongoose.connect(config.DATABASE_URL, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 50,
        });
        isConnected = true;
        console.log('[MongoDB] ✅ Database connected successfully');
        return mongoose.connection;
    } catch (err) {
        console.error('[MongoDB Error]: Connection failed:', err.message);
        throw err;
    }
}

// Re-export models for convenient imports across decoupled services
module.exports = {
    connectDB,
    mongoose,
    UserModel: require('../model/UserModel').UserModel,
    OrdersModel: require('../model/OrdersModel').OrdersModel,
    PositionsModel: require('../model/PositionsModel').PositionsModel,
    HoldingsModel: require('../model/HoldingsModel').HoldingsModel,
    OptionPositionsModel: require('../model/OptionPositionsModel').OptionPositionsModel,
    ClosedPositionModel: require('../model/ClosedPositionModel').ClosedPositionModel,
    WalletModel: require('../model/WalletModel').WalletModel,
    WatchlistModel: require('../model/WatchlistModel').WatchlistModel,
    FundTransactionModel: require('../model/FundTransactionModel').FundTransactionModel,
    NotificationModel: require('../model/NotificationModel').NotificationModel,
    TradeModel: require('../model/TradeModel').TradeModel,
    RiskLogModel: require('../model/RiskLogModel').RiskLogModel,
    PLRecordModel: require('../model/PLRecordModel').PLRecordModel,
};
