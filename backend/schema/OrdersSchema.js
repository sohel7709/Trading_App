const { Schema } = require('mongoose');

const OrdersSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', index: true },
    stockSymbol: { type: String, required: true, uppercase: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },        // limit/execution price
    triggerPrice: { type: Number, default: null },  // SL / SL-M trigger
    // SL (not SL-M) only becomes an active limit order once LTP crosses
    // triggerPrice; until then it's dormant. Tracks that transition.
    slTriggered: { type: Boolean, default: false },
    type: { type: String, enum: ['MARKET', 'LIMIT', 'SL', 'SLM'], default: 'MARKET' },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    status: { type: String, enum: ['PENDING', 'EXECUTED', 'CANCELLED', 'REJECTED'], default: 'PENDING' },
    productType: { type: String, enum: ['CNC', 'MIS', 'NRML'], default: 'CNC' },
    exchange: { type: String, enum: ['NSE', 'BSE'], default: 'NSE' },
    rejectionReason: { type: String, default: null },
    // Basket orders — every leg of a basket shares a basketId
    basketId: { type: Schema.Types.ObjectId, default: null },
    // Cover orders — main (market) leg links to its compulsory SL-M leg
    isCoverOrder: { type: Boolean, default: false },
    linkedOrderId: { type: Schema.Types.ObjectId, default: null },
    // Option-specific contract fields
    underlyingSymbol: { type: String, default: null },
    strikePrice: { type: Number, default: null },
    optionType: { type: String, enum: ['CE', 'PE', null], default: null },
    expiry: { type: String, default: null },
    lots: { type: Number, default: null },
}, { timestamps: true });

OrdersSchema.index({ instituteId: 1, userId: 1, createdAt: -1 });

module.exports = { OrdersSchema };