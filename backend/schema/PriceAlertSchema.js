const { Schema } = require('mongoose');

const PriceAlertSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', index: true },

    stockSymbol: { type: String, required: true, uppercase: true },
    targetPrice: { type: Number, required: true },
    condition: { type: String, enum: ['ABOVE', 'BELOW'], required: true },
    active: { type: Boolean, default: true },
    triggered: { type: Boolean, default: false },
    triggeredAt: { type: Date, default: null },

    // GTT fields — when gtt=true, hitting `condition`/`targetPrice` places a
    // real order instead of just flagging the alert.
    gtt: { type: Boolean, default: false },
    side: { type: String, enum: ['BUY', 'SELL'], default: null },
    quantity: { type: Number, default: null },
    limitPrice: { type: Number, default: null },
    productType: { type: String, enum: ['CNC', 'MIS', 'NRML'], default: 'CNC' },

    // OCO (one-cancels-other) — a second independent trigger; whichever leg
    // fires first executes and deactivates the whole GTT.
    triggerType: { type: String, enum: ['single', 'oco'], default: 'single' },
    ocoTargetPrice: { type: Number, default: null },
    ocoCondition: { type: String, enum: ['ABOVE', 'BELOW'], default: null },
}, { timestamps: true });

PriceAlertSchema.index({ instituteId: 1, userId: 1, active: 1 });

module.exports = { PriceAlertSchema };