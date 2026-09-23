const { Schema } = require('mongoose');

const NotificationSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', index: true },
    type: { type: String, enum: ['RISK', 'TRADE', 'CAPITAL', 'INFO'], default: 'INFO' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    data: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = { NotificationSchema };
