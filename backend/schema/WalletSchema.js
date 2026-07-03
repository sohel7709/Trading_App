const { Schema } = require('mongoose');

const WalletSchema = new Schema({
    balance: { type: Number, default: 0 },
    // CNC (delivery) holdings cost basis only. Recomputed fresh from
    // HoldingsModel on every equity fill — see orderEngine.js executeOrder().
    usedMargin: { type: Number, default: 0 },
    // Margin blocked by open MIS (intraday) equity positions: notional /
    // MIS_LEVERAGE, recomputed fresh from PositionsModel on every equity
    // fill. Previously MIS positions consumed zero margin at all.
    misMargin: { type: Number, default: 0 },
    // Margin blocked by open option positions (premium paid for longs,
    // approxOptionWriteMargin for short/written legs). Tracked as an
    // incremental delta by executeOptionOrder() / day-prep settlement in
    // index.js — kept in its own field specifically so a *separate* equity
    // fill (which recomputes `usedMargin` fresh from holdings) can no longer
    // silently wipe it by overwriting a field the two features used to share.
    optionMargin: { type: Number, default: 0 },
    // Funds reserved for resting PENDING orders (LIMIT/SL/SL-M) — not yet
    // spent, but not available for a new order either. Recomputed from the
    // live pending-order book, same pattern as usedMargin/holdings.
    blockedMargin: { type: Number, default: 0 },
    availableMargin: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = { WalletSchema };