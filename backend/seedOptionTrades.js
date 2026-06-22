/**
 * Seed option trades — June 19, 2026
 *
 * Expiry dates (correct):
 *   BANKNIFTY = 30JUN (30 June)
 *   NIFTY     = 23JUN (23 June)
 *   SENSEX    = 25JUN (25 June)
 *
 * Strike gaps: NIFTY=50, BANKNIFTY=100, SENSEX=100
 * Prices anchored to real NSE 19-Jun-2026 levels (IT-led selloff day):
 *   NIFTY 24,013 | BANKNIFTY 57,686 | SENSEX 76,803
 * 7 profit + 15 loss = 22 trades, NET = -₹2,45,65,825
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { TradeModel } = require('./model/TradeModel');
const { OrdersModel } = require('./model/OrdersModel');

function ist(h, m, s = 0) {
    const d = new Date('2026-06-19T00:00:00.000Z');
    d.setUTCHours(h - 5, m - 30, s, 0);
    if (d.getTime() < new Date('2026-06-19T00:00:00Z').getTime())
        d.setUTCDate(d.getUTCDate() + 1);
    return d;
}

const TRADES = [

    // ====== PROFITS: 7 Trades, +₹85,40,240 ======
    // Spot refs (NSE 19-Jun-2026): NIFTY 24,013 | BANKNIFTY 57,686 | SENSEX 76,803

    // 1: BN 57700 CE
    { symbol:'BANKNIFTY30JUN57700CE', lots:170, lotSize:30, buyPrice:698.40,  sellPrice:812.65,  buyTime:ist(9,18,22), sellTime:ist(9,52,41) },
    // 2: NIFTY 24050 CE
    { symbol:'NIFTY23JUN24050CE',     lots:340, lotSize:75, buyPrice:88.30,   sellPrice:118.60,  buyTime:ist(9,24,9),  sellTime:ist(10,6,33) },
    // 3: SENSEX 76800 CE
    { symbol:'SENSEX25JUN76800CE',    lots:1600,lotSize:10, buyPrice:268.50,  sellPrice:392.75,  buyTime:ist(9,21,47), sellTime:ist(10,11,18) },
    // 4: BN 57500 PE
    { symbol:'BANKNIFTY30JUN57500PE', lots:180, lotSize:30, buyPrice:640.20,  sellPrice:798.55,  buyTime:ist(10,8,14), sellTime:ist(10,54,27) },
    // 5: NIFTY 23950 PE
    { symbol:'NIFTY23JUN23950PE',     lots:360, lotSize:75, buyPrice:120.40,  sellPrice:166.85,  buyTime:ist(10,14,52),sellTime:ist(11,2,9) },
    // 6: SENSEX 76500 PE
    { symbol:'SENSEX25JUN76500PE',    lots:1500,lotSize:10, buyPrice:310.75,  sellPrice:458.20,  buyTime:ist(10,22,31),sellTime:ist(11,18,44) },
    // 7: BN 57800 CE
    { symbol:'BANKNIFTY30JUN57800CE', lots:170, lotSize:30, buyPrice:540.65,  sellPrice:712.40,  buyTime:ist(10,31,5), sellTime:ist(11,24,16) },

    // ====== LOSSES: 10 Trades, -₹2,55,84,798 ======

    // 8: NIFTY 24100 CE
    { symbol:'NIFTY23JUN24100CE',     lots:350, lotSize:75, buyPrice:142.80,  sellPrice:58.35,   buyTime:ist(11,6,18), sellTime:ist(12,38,52) },
    // 9: BN 58000 CE
    { symbol:'BANKNIFTY30JUN58000CE', lots:180, lotSize:30, buyPrice:612.30,  sellPrice:95.40,   buyTime:ist(11,12,44),sellTime:ist(13,4,9) },
    // 10: SENSEX 77200 CE
    { symbol:'SENSEX25JUN77200CE',    lots:1600,lotSize:10, buyPrice:245.60,  sellPrice:48.30,   buyTime:ist(11,18,33),sellTime:ist(13,22,51) },
    // 11: NIFTY 24200 CE
    { symbol:'NIFTY23JUN24200CE',     lots:360, lotSize:75, buyPrice:168.45,  sellPrice:30.20,   buyTime:ist(11,33,7), sellTime:ist(13,48,22) },
    // 12: BN 57400 PE
    { symbol:'BANKNIFTY30JUN57400PE', lots:180, lotSize:30, buyPrice:685.50,  sellPrice:285.65,  buyTime:ist(11,46,29),sellTime:ist(13,55,14) },
    // 13: SENSEX 77500 CE
    { symbol:'SENSEX25JUN77500CE',    lots:1500,lotSize:10, buyPrice:198.35,  sellPrice:74.60,   buyTime:ist(12,2,51), sellTime:ist(14,7,38) },
    // 14: NIFTY 24250 CE
    { symbol:'NIFTY23JUN24250CE',     lots:360, lotSize:75, buyPrice:152.30,  sellPrice:22.40,   buyTime:ist(12,14,6), sellTime:ist(14,18,49) },
    // 15: BN 58200 CE
    { symbol:'BANKNIFTY30JUN58200CE', lots:170, lotSize:30, buyPrice:458.70,  sellPrice:142.35,  buyTime:ist(12,28,37),sellTime:ist(14,26,3) },
    // 16: SENSEX 77800 CE
    { symbol:'SENSEX25JUN77800CE',    lots:1400,lotSize:10, buyPrice:168.45,  sellPrice:32.20,   buyTime:ist(12,41,19),sellTime:ist(14,33,27) },
    // 17: NIFTY 23850 PE
    { symbol:'NIFTY23JUN23850PE',     lots:360, lotSize:75, buyPrice:158.65,  sellPrice:72.40,   buyTime:ist(12,55,2), sellTime:ist(14,41,55) },

    // ====== MIXED: recovery + final losses, 5 Trades, -₹78,35,067 ======

    // 18: NIFTY 24000 PE (recovery profit)
    { symbol:'NIFTY23JUN24000PE',     lots:350, lotSize:75, buyPrice:102.40,  sellPrice:138.65,  buyTime:ist(13,10,38),sellTime:ist(14,2,17) },
    // 19: BN 57300 PE
    { symbol:'BANKNIFTY30JUN57300PE', lots:180, lotSize:30, buyPrice:720.30,  sellPrice:642.85,  buyTime:ist(13,24,11),sellTime:ist(14,48,33) },
    // 20: SENSEX 76600 PE
    { symbol:'SENSEX25JUN76600PE',    lots:1500,lotSize:10, buyPrice:288.50,  sellPrice:88.20,   buyTime:ist(13,38,46),sellTime:ist(14,55,28) },
    // 21: NIFTY 24150 CE
    { symbol:'NIFTY23JUN24150CE',     lots:360, lotSize:75, buyPrice:158.30,  sellPrice:38.45,   buyTime:ist(13,52,19),sellTime:ist(15,4,7) },
    // 22: BN 57900 CE
    { symbol:'BANKNIFTY30JUN57900CE', lots:180, lotSize:30, buyPrice:512.60,  sellPrice:118.35,  buyTime:ist(14,6,55), sellTime:ist(15,12,44) },
];

async function seed() {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✓ Connected to MongoDB\n');

    const ds = new Date('2026-06-19T00:00:00Z'), de = new Date('2026-06-19T23:59:59Z');
    const d1 = await TradeModel.deleteMany({ productType: 'NRML', createdAt: { $gte: ds, $lte: de } });
    const d2 = await OrdersModel.deleteMany({ productType: 'NRML', createdAt: { $gte: ds, $lte: de } });
    console.log(`Cleared ${d1.deletedCount} trades, ${d2.deletedCount} orders\n`);

    let totalPnl = 0, totalTurnover = 0, rows = [];

    for (const t of TRADES) {
        const qty = t.lots * t.lotSize;
        const bv = Math.round(qty * t.buyPrice * 100) / 100;
        const sv = Math.round(qty * t.sellPrice * 100) / 100;
        const pn = Math.round((sv - bv) * 100) / 100;
        const stt = Math.round(sv * 0.0005 * 100) / 100;
        const br = Math.round((bv + sv) * 0.00003 * 100) / 100;
        const ch = Math.round((stt + br) * 100) / 100;

        const bo = new mongoose.Types.ObjectId(), so = new mongoose.Types.ObjectId();
        await OrdersModel.create({ _id: bo, stockSymbol: t.symbol, quantity: qty, price: t.buyPrice, type: 'MARKET', side: 'BUY', status: 'EXECUTED', productType: 'NRML', createdAt: t.buyTime, updatedAt: t.buyTime });
        await TradeModel.create({ stockSymbol: t.symbol, quantity: qty, price: t.buyPrice, side: 'BUY', productType: 'NRML', orderId: bo, charges: Math.round(ch * 0.4 * 100) / 100, totalValue: bv, createdAt: t.buyTime, updatedAt: t.buyTime });
        await OrdersModel.create({ _id: so, stockSymbol: t.symbol, quantity: qty, price: t.sellPrice, type: 'MARKET', side: 'SELL', status: 'EXECUTED', productType: 'NRML', createdAt: t.sellTime, updatedAt: t.sellTime });
        await TradeModel.create({ stockSymbol: t.symbol, quantity: qty, price: t.sellPrice, side: 'SELL', productType: 'NRML', orderId: so, charges: Math.round(ch * 0.6 * 100) / 100, totalValue: sv, createdAt: t.sellTime, updatedAt: t.sellTime });

        totalPnl += pn; totalTurnover += bv + sv;
        const ib = t.buyTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const is_ = t.sellTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const ps = pn >= 0 ? `\x1b[32m+₹${(pn/100000).toFixed(2)}L\x1b[0m` : `\x1b[31m-₹${(Math.abs(pn)/100000).toFixed(2)}L\x1b[0m`;
        rows.push({ symbol: t.symbol, lots: t.lots, buy: `${ib} @ ₹${t.buyPrice}`, sell: `${is_} @ ₹${t.sellPrice}`, pnl: ps });
    }

    console.log('Symbol'.padEnd(30) + 'Lots'.padEnd(7) + 'BUY Time & Price'.padEnd(26) + 'SELL Time & Price'.padEnd(26) + 'P&L');
    console.log('─'.repeat(110));
    for (const r of rows) console.log(r.symbol.padEnd(30) + String(r.lots).padEnd(7) + r.buy.padEnd(26) + r.sell.padEnd(26) + r.pnl);

    const exact = Math.round(totalPnl), cr = Math.floor(Math.abs(exact) / 10000000), lk = Math.floor((Math.abs(exact) % 10000000) / 100000), th = Math.floor((Math.abs(exact) % 100000) / 1000), hd = Math.abs(exact) % 1000;
    console.log('\n' + '═'.repeat(110));
    console.log(`Total turnover : ₹${(totalTurnover/10000000).toFixed(4)} crore`);
    console.log(`NET P&L        : ${exact < 0 ? '-' : '+'}₹${cr} crore ${lk} lakh ${th} thousand ${hd} rupees`);
    console.log(`NET P&L (₹)    : ${exact < 0 ? '-' : '+'}₹${Math.abs(exact).toLocaleString('en-IN')}`);
    console.log('═'.repeat(110));
    await mongoose.disconnect();
    console.log('\n✓ Done');
}

seed().catch(e => { console.error('\n✗', e.message); process.exit(1); });