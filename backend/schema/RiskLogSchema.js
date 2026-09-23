const { Schema } = require('mongoose');

const RiskLogSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    ruleType: { type: String, required: true }, // e.g. 'MAX_LOSS_PER_DAY', 'MAX_QTY_PER_TRADE'
    message: { type: String, required: true },
}, { timestamps: true });

module.exports = { RiskLogSchema };
