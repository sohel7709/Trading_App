'use strict';

// Realistic Zerodha-style charges — replaces the old flat "0.05% brokerage on
// everything" approximation. Rates match Zerodha's published 2024-25 tariff
// (post the Oct-2024 STT hike on F&O). Real invoices round per-component
// differently and apply state-specific stamp-duty caps; this is a faithful
// simulation, not a tax/accounting-grade implementation.
//
// segment: 'equity_delivery' | 'equity_intraday' | 'options' | 'futures'
// side:    'BUY' | 'SELL'
// turnover: trade value (qty * price) for this leg

const RATES = {
    equity_delivery: {
        brokerage: 0,                 // zero brokerage on delivery, matches real Zerodha
        sttBuy: 0.001, sttSell: 0.001,       // 0.1% both sides
        exchangeTxn: 0.0000297,              // NSE ~0.00297%
        sebi: 0.000001,                      // ₹10/crore
        stampDutyBuy: 0.00015,               // 0.015% buy side only
        dpChargeOnSell: 15.34,               // flat DP/CDSL charge (incl. GST), sell side, per scrip per day
    },
    equity_intraday: {
        brokerageRate: 0.0003, brokerageCap: 20,  // 0.03% or ₹20, whichever lower
        sttSellOnly: 0.00025,                     // 0.025% sell side only
        exchangeTxn: 0.0000297,
        sebi: 0.000001,
        stampDutyBuy: 0.00003,                    // 0.003% buy side only
    },
    options: {
        brokerageFlat: 20,                        // ₹20 flat per executed order (or 0.03%, whichever lower — 0.03% of typical premium turnover rarely beats ₹20)
        brokerageRate: 0.0003,
        sttSellOnly: 0.001,                        // 0.1% of premium, sell side only (post Oct-2024 hike)
        exchangeTxn: 0.0003503,                    // 0.03503% of premium
        sebi: 0.000001,
        stampDutyBuy: 0.00003,                     // 0.003% buy side only
    },
    futures: {
        brokerageFlat: 20,
        brokerageRate: 0.0003,
        sttSellOnly: 0.0002,                       // 0.02% sell side only
        exchangeTxn: 0.000019,                     // 0.0019%
        sebi: 0.000001,
        stampDutyBuy: 0.00002,                     // 0.002% buy side only
    },
};

const GST_RATE = 0.18; // on (brokerage + exchange txn charge + SEBI charges)
const r2 = (n) => Math.round((n || 0) * 100) / 100;

function calcCharges({ segment, side, turnover }) {
    const isBuy = side === 'BUY';
    let brokerage = 0, stt = 0, exchangeCharges = 0, sebiCharges = 0, stampDuty = 0, dpCharge = 0;

    if (segment === 'equity_delivery') {
        const c = RATES.equity_delivery;
        brokerage = c.brokerage;
        stt = turnover * (isBuy ? c.sttBuy : c.sttSell);
        exchangeCharges = turnover * c.exchangeTxn;
        sebiCharges = turnover * c.sebi;
        stampDuty = isBuy ? turnover * c.stampDutyBuy : 0;
        dpCharge = !isBuy ? c.dpChargeOnSell : 0;
    } else if (segment === 'equity_intraday') {
        const c = RATES.equity_intraday;
        brokerage = Math.min(c.brokerageCap, turnover * c.brokerageRate);
        stt = !isBuy ? turnover * c.sttSellOnly : 0;
        exchangeCharges = turnover * c.exchangeTxn;
        sebiCharges = turnover * c.sebi;
        stampDuty = isBuy ? turnover * c.stampDutyBuy : 0;
    } else if (segment === 'options') {
        const c = RATES.options;
        brokerage = Math.min(c.brokerageFlat, turnover * c.brokerageRate || c.brokerageFlat);
        stt = !isBuy ? turnover * c.sttSellOnly : 0;
        exchangeCharges = turnover * c.exchangeTxn;
        sebiCharges = turnover * c.sebi;
        stampDuty = isBuy ? turnover * c.stampDutyBuy : 0;
    } else if (segment === 'futures') {
        const c = RATES.futures;
        brokerage = Math.min(c.brokerageFlat, turnover * c.brokerageRate || c.brokerageFlat);
        stt = !isBuy ? turnover * c.sttSellOnly : 0;
        exchangeCharges = turnover * c.exchangeTxn;
        sebiCharges = turnover * c.sebi;
        stampDuty = isBuy ? turnover * c.stampDutyBuy : 0;
    }

    const gst = (brokerage + exchangeCharges + sebiCharges) * GST_RATE;
    const total = brokerage + stt + exchangeCharges + sebiCharges + stampDuty + dpCharge + gst;

    return {
        brokerage: r2(brokerage),
        stt: r2(stt),
        exchangeCharges: r2(exchangeCharges),
        sebiCharges: r2(sebiCharges),
        stampDuty: r2(stampDuty),
        dpCharge: r2(dpCharge),
        gst: r2(gst),
        total: r2(total),
    };
}

// Convenience: equity segment picker from productType
function equitySegment(productType) {
    return productType === 'MIS' ? 'equity_intraday' : 'equity_delivery';
}

module.exports = { calcCharges, equitySegment, RATES, GST_RATE };
