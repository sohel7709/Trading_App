const { Schema } = require('mongoose');

// Curated corporate-action calendar (dividend / split / bonus) — there is no
// free live NSE corporate-actions feed, so this is a maintained static list.
// `applied` flags actions already reflected in holdings so /admin/apply-corporate-actions
// is idempotent.
const CorporateActionSchema = new Schema({
    stockSymbol: { type: String, required: true, uppercase: true },
    type:        { type: String, enum: ['DIVIDEND', 'SPLIT', 'BONUS'], required: true },
    exDate:      { type: Date, required: true },
    // DIVIDEND: rupees per share. SPLIT: "from:to" e.g. 1 share of ₹10 FV -> 5 of ₹2 FV is ratio 5.
    // BONUS: "from:to" e.g. 1:1 bonus doubles quantity, ratio 2.
    dividendPerShare: { type: Number, default: null },
    ratio:            { type: Number, default: null },
    applied:     { type: Boolean, default: false },
    appliedAt:   { type: Date, default: null },
}, { timestamps: true });

module.exports = { CorporateActionSchema };
