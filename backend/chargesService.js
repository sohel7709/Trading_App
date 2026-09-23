'use strict';

// Simplified to flat Rs 20 per trade for all segments.
const RATES = {
    equity_delivery: { brokerage: 20 },
    equity_intraday: { brokerage: 20 },
    options:         { brokerage: 20 },
    futures:         { brokerage: 20 },
};

const GST_RATE = 0;
const r2 = (n) => Math.round((n || 0) * 100) / 100;

function calcCharges({ segment, side, turnover }) {
    // Flat 20 Rs total
    return {
        brokerage: 20,
        stt: 0,
        exchangeCharges: 0,
        sebiCharges: 0,
        stampDuty: 0,
        dpCharge: 0,
        gst: 0,
        total: 20,
    };
}

function equitySegment(productType) {
    return productType === 'MIS' ? 'equity_intraday' : 'equity_delivery';
}

module.exports = { calcCharges, equitySegment, RATES, GST_RATE };
