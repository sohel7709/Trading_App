const { Schema } = require('mongoose');

const OptionPositionsSchema = new Schema({
    symbol:           { type: String, required: true },  // e.g. "NIFTY25JUL24500CE"
    underlyingSymbol: { type: String, required: true },  // "NIFTY 50"
    strikePrice:      { type: Number, required: true },
    optionType:       { type: String, enum: ['CE', 'PE'], required: true },
    expiry:           { type: String, required: true },  // YYYY-MM-DD
    lotSize:          { type: Number, required: true },
    lots:             { type: Number, required: true },
    quantity:         { type: Number, required: true },  // lots × lotSize
    avgPremium:       { type: Number, required: true },
    ltp:              { type: Number, default: 0 },
    productType:      { type: String, default: 'NRML' },
}, { timestamps: true });

module.exports = { OptionPositionsSchema };
