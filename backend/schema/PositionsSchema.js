const { Schema } = require('mongoose');

const PositionsSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', index: true },

    stockSymbol: { type: String, required: true, uppercase: true },
    quantity: { type: Number, required: true },
    avgPrice: { type: Number, required: true },
    ltp: { type: Number, default: 0 },
    productType: { type: String, enum: ['CNC', 'MIS', 'NRML'], default: 'MIS' },
    isIntraday: { type: Boolean, default: false },
}, { timestamps: true });

PositionsSchema.index({ instituteId: 1, userId: 1 });

module.exports = { PositionsSchema };