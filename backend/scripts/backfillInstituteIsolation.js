'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { UserModel } = require('../model/UserModel');
const { InstituteModel } = require('../model/InstituteModel');
const { OrdersModel } = require('../model/OrdersModel');
const { TradeModel } = require('../model/TradeModel');
const { PositionsModel } = require('../model/PositionsModel');
const { OptionPositionsModel } = require('../model/OptionPositionsModel');
const { ClosedPositionModel } = require('../model/ClosedPositionModel');
const { WatchlistModel } = require('../model/WatchlistModel');
const { PriceAlertModel } = require('../model/PriceAlertModel');

const MONGO_URI = process.env.DATABASE_URL || process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/zerodha';

async function backfill() {
    console.log('[Backfill] Connecting to MongoDB:', MONGO_URI ? 'URI defined' : 'URI undefined');
    await mongoose.connect(MONGO_URI);
    console.log('[Backfill] ✅ Connected to MongoDB Atlas');

    // Find default institute if any users have null instituteId
    const defaultInstitute = await InstituteModel.findOne({}).lean();
    console.log('[Backfill] Default Institute:', defaultInstitute?.name, defaultInstitute?._id);

    // 1. Build a map of userId -> instituteId
    const users = await UserModel.find({}).select('_id instituteId username role').lean();
    console.log(`[Backfill] Loaded ${users.length} users from MongoDB`);
    
    const userInstituteMap = new Map();
    for (const u of users) {
        const instId = u.instituteId || defaultInstitute?._id;
        if (instId) {
            userInstituteMap.set(u._id.toString(), instId);
            // If user itself had no instituteId, attach default
            if (!u.instituteId && defaultInstitute?._id) {
                await UserModel.updateOne({ _id: u._id }, { $set: { instituteId: defaultInstitute._id } });
            }
        }
    }

    const collections = [
        { name: 'Orders', model: OrdersModel },
        { name: 'Trades', model: TradeModel },
        { name: 'Positions', model: PositionsModel },
        { name: 'OptionPositions', model: OptionPositionsModel },
        { name: 'ClosedPositions', model: ClosedPositionModel },
        { name: 'Watchlists', model: WatchlistModel },
        { name: 'PriceAlerts', model: PriceAlertModel },
    ];

    for (const { name, model } of collections) {
        console.log(`[Backfill] Checking collection: ${name}...`);
        const missing = await model.find({ $or: [{ instituteId: { $exists: false } }, { instituteId: null }] }).lean();
        console.log(`[Backfill] Found ${missing.length} documents in ${name} missing instituteId`);

        let updatedCount = 0;
        for (const doc of missing) {
            let instId = null;
            if (doc.userId) {
                instId = userInstituteMap.get(doc.userId.toString());
            }
            if (!instId && defaultInstitute?._id) {
                instId = defaultInstitute._id;
            }
            if (instId) {
                await model.updateOne({ _id: doc._id }, { $set: { instituteId: instId } });
                updatedCount++;
            }
        }
        console.log(`[Backfill] ✅ Updated ${updatedCount}/${missing.length} documents in ${name}`);

        // Ensure compound indexes
        try {
            await model.collection.createIndex({ instituteId: 1, userId: 1 });
            console.log(`[Backfill] 📇 Index { instituteId: 1, userId: 1 } ensured on ${name}`);
        } catch (idxErr) {
            console.warn(`[Backfill] Index warning for ${name}:`, idxErr.message);
        }
    }

    console.log('[Backfill] 🎉 All collections backfilled and indexed successfully!');
    await mongoose.disconnect();
}

backfill().catch(err => {
    console.error('[Backfill] ❌ Error:', err);
    process.exit(1);
});
