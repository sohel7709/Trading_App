const { Schema } = require('mongoose');

const PLRecordSchema = new Schema({
    tradeDate:      { type: Date,   required: true },
    symbol:         { type: String, required: true, uppercase: true },
    quantity:       { type: Number, required: true },
    buyValue:       { type: Number, default: 0 },
    sellValue:      { type: Number, default: 0 },
    realizedPL:     { type: Number, default: 0 },
    charges:        { type: Number, default: 0 },
    // Real per-component charge breakdown (from the trade sheet)
    brokerage:       { type: Number, default: 0 },
    stt:             { type: Number, default: 0 },
    exchangeCharges: { type: Number, default: 0 },
    gst:             { type: Number, default: 0 },
    sebiCharges:     { type: Number, default: 0 },
    stampDuty:       { type: Number, default: 0 },
    netPL:          { type: Number, default: 0 },
    realizedPLPct:  { type: Number, default: 0 },
    segment:        { type: String, enum: ['equity','fno','currency','commodity','mutualfunds','mtf','combined'], default: 'fno' },
    source:         { type: String, default: 'import' },
}, { timestamps: true });

// Index for fast date range + segment queries
PLRecordSchema.index({ tradeDate: 1, segment: 1 });

module.exports = { PLRecordSchema };
