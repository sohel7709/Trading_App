const { Schema } = require('mongoose');

// One row per fully-squared-off position "leg" — snapshot taken at the
// moment a PositionsModel/OptionPositionsModel doc nets to zero and is
// deleted. Frozen forever (never recomputed), so the Positions screen can
// show "what you booked" for a closed trade without it moving, while the
// underlying trade log (TradeModel) remains the source of truth for
// aggregate/day P&L.
const ClosedPositionSchema = new Schema({
    kind: { type: String, enum: ['equity', 'option'], required: true },
    symbol: { type: String, required: true },       // stockSymbol for equity, option symbol for option
    productType: { type: String, default: 'MIS' },
    quantity: { type: Number, required: true },      // signed size of the closed leg (+long / -short)
    lots: { type: Number },                          // options only
    // Options only — kept so the Positions screen can still look up a live
    // reference LTP for a closed option row (the P&L itself stays frozen).
    underlyingSymbol: { type: String },
    strikePrice: { type: Number },
    optionType: { type: String },
    expiry: { type: String },
    avgPrice: { type: Number, required: true },       // entry avg price/premium
    exitPrice: { type: Number, required: true },      // exit price/premium
    pnl: { type: Number, required: true },            // booked, frozen P&L for this close
    dateStr: { type: String, required: true },        // IST trading day, e.g. '2026-07-03'
    closedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = { ClosedPositionSchema };
