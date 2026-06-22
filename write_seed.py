# Direct approach: craft realistic option trades for today
# Strike gaps: NIFTY=50, BANKNIFTY=100, SENSEX=100
# Expiry: BANKNIFTY=30JUN, NIFTY=23JUN, SENSEX=25JUN
# Target P&L: -24,076,345
# Each buy value: 40-50L

TARGET = -24076345.0

# Trade format: (symbol, lots, lotSize, buyPrice, sellPrice)
# We compute buyVal = lots*lotSize*buyPrice, P&L = lots*lotSize*(sellPrice - buyPrice)
trades_raw = [
    # === 8 PROFIT TRADES ===
    ('BANKNIFTY30JUN57900CE',   14, 30, 987.45, 1528.73),
    ('NIFTY23JUN24100CE',      320, 75, 184.73,  287.91),
    ('SENSEX25JUN77200CE',     158, 10, 287.34,  524.68),
    ('BANKNIFTY30JUN57500PE',   15, 30, 975.32, 1435.87),
    ('NIFTY23JUN23950PE',      310, 75, 176.54,  348.76),
    ('SENSEX25JUN77000PE',     148, 10, 307.82,  518.43),
    ('BANKNIFTY30JUN57300PE',   17, 30, 873.56, 1227.84),
    ('NIFTY23JUN24000CE',      940, 75,  63.87,   89.45),

    # === 11 LOSS TRADES ===
    ('BANKNIFTY30JUN57700CE',   14, 30, 1012.37,  197.53),
    ('NIFTY23JUN24200CE',      245, 75, 244.63,   24.87),
    ('SENSEX25JUN77500CE',    1550, 10, 296.73,  123.45),
    ('BANKNIFTY30JUN57600PE',   13, 30, 1098.45,  168.82),
    ('NIFTY23JUN24050PE',      285, 75, 199.73,   83.56),
    ('SENSEX25JUN77200PE',    1480, 10, 293.67,  118.34),
    ('BANKNIFTY30JUN58000CE',   15, 30,  943.67,  188.43),
    ('NIFTY23JUN24250CE',      240, 75, 232.45,   51.78),
    ('SENSEX25JUN77800CE',    1520, 10, 279.83,   97.62),
    ('BANKNIFTY30JUN57400PE',   14, 30, 1023.78,  196.54),
    ('NIFTY23JUN23900PE',      300, 75, 182.34,   68.91),
]

total = 0.0
print(f"{'Symbol':<30} {'Lots':>5} {'Qty':>7} {'Buy':>9} {'Sell':>9} {'BuyV':>8} {'P&L':>9} {'OK':>5}")
print("-" * 95)
results = []
for sym, lots, ls, bp, sp in trades_raw:
    qty = lots * ls
    bv = round(qty * bp, 2)
    sv = round(qty * sp, 2)
    pnl = round(sv - bv, 2)
    total += pnl
    bvL = bv / 100000
    pnlL = pnl / 100000
    ok = "OK" if sp > 0 and 35 <= bvL <= 55 else ("!" if sp <= 0 else "~")
    results.append({'symbol': sym, 'lots': lots, 'lotSize': ls, 'buyPrice': bp, 'sellPrice': sp, 'pnl': pnl, 'buyVal': bv})
    print(f"{sym:<30} {lots:>5} {qty:>7} {bp:>9.2f} {sp:>9.2f} {bvL:>7.2f}L {pnlL:>+8.2f}L {ok}")

print(f"\nNet P&L: ₹{total:+,.2f}")
diff = TARGET - total
print(f"Target:  ₹{TARGET:,.0f}")
print(f"Diff:    ₹{diff:+,.0f} ({diff/100000:+.2f}L)")

# Tune last trade to hit exact target
if abs(diff) > 100:
    last = results[-1]
    old_pnl = last['pnl']
    new_pnl = old_pnl + diff
    # Adjust sell price
    qty = last['lots'] * last['lotSize']
    new_sp = last['buyPrice'] + new_pnl / qty
    new_sp = round(new_sp, 2)
    last['sellPrice'] = new_sp
    last['pnl'] = round(qty * (new_sp - last['buyPrice']), 2)
    new_total = sum(r['pnl'] for r in results)
    print(f"\nTuned {last['symbol']}: sell {new_sp}, Net=₹{new_total:+,.0f}")

# Write JS
notes = [
    'BN morning rally CE gain',
    'NIFTY morning rally gamma',
    'SENSEX morning +260pts CE',
    'BN crash PE deep ITM',
    'NIFTY crash PE ATM flip',
    'SENSEX crash PE OTM→ITM',
    'BN mid-crash PE additional',
    'NIFTY afternoon scalp CE',
    'BN CE crash dip crushed',
    'NIFTY OTM CE theta crush',
    'SENSEX CE theta decay',
    'BN PE bounce whipsaw',
    'NIFTY PE sideways theta',
    'SENSEX PE near close flat',
    'BN CE bought at peak, -175pts',
    'NIFTY OTM CE crash destroyed',
    'SENSEX OTM CE crash phase',
    'BN PE bought at recovery bounce',
    'NIFTY PE no afternoon move',
]

with open('backend/seedOptionTrades.js', 'w') as f:
    f.write("""/**
 * Seed option trades — June 19, 2026
 * All prices non-round with paise, buy values ₹40-50L
 * Strike gaps: NIFTY=50, BANKNIFTY=100, SENSEX=100
 * Expiry: BANKNIFTY=30JUN, NIFTY=23JUN, SENSEX=25JUN
 * Net P&L target: -₹2,40,76,345
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { TradeModel } = require('./model/TradeModel');
const { OrdersModel } = require('./model/OrdersModel');
const MONGO_URI = process.env.DATABASE_URL;

function ist(h, m, s = 0) {
    const d = new Date('2026-06-19T00:00:00.000Z');
    d.setUTCHours(h - 5, m - 30, s, 0);
    if (d.getTime() < new Date('2026-06-19T00:00:00Z').getTime())
        d.setUTCDate(d.getUTCDate() + 1);
    return d;
}

const TRADES = [
""")

    for i, r in enumerate(results):
        time_offset = i * 7
        f.write(f"  {{ symbol: '{r['symbol']}', lots: {r['lots']}, lotSize: {r['lotSize']},\n")
        f.write(f"    buyPrice: {r['buyPrice']}, buyTime: ist(9, {15 + time_offset}, {22 + i * 11}),\n")
        f.write(f"    sellPrice: {r['sellPrice']}, sellTime: ist({10 + (i % 5)}, {3 + time_offset}, {44 + i * 13}) }},\n")

    f.write("""
];

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log('\\n✓ Connected to MongoDB');

    const ds = new Date('2026-06-19T00:00:00Z');
    const de = new Date('2026-06-19T23:59:59Z');
    const d1 = await TradeModel.deleteMany({ productType: 'NRML', createdAt: { $gte: ds, $lte: de } });
    const d2 = await OrdersModel.deleteMany({ productType: 'NRML', createdAt: { $gte: ds, $lte: de } });
    console.log(`Cleared: ${d1.deletedCount} trades, ${d2.deletedCount} orders\\n`);

    let totalPnl = 0, totalTurnover = 0, rows = [];

    for (const t of TRADES) {
        const qty = t.lots * t.lotSize;
        const bv = Math.round(qty * t.buyPrice * 100) / 100;
        const sv = Math.round(qty * t.sellPrice * 100) / 100;
        const pn = Math.round((sv - bv) * 100) / 100;
        const stt = Math.round(sv * 0.0005 * 100) / 100;
        const br = Math.round((bv + sv) * 0.00003 * 100) / 100;
        const ch = Math.round((stt + br) * 100) / 100;

        const bo = new mongoose.Types.ObjectId();
        const so = new mongoose.Types.ObjectId();

        await OrdersModel.create({ _id: bo, stockSymbol: t.symbol, quantity: qty, price: t.buyPrice, type: 'MARKET', side: 'BUY', status: 'EXECUTED', productType: 'NRML', createdAt: t.buyTime, updatedAt: t.buyTime });
        await TradeModel.create({ stockSymbol: t.symbol, quantity: qty, price: t.buyPrice, side: 'BUY', productType: 'NRML', orderId: bo, charges: Math.round(ch * 0.4 * 100) / 100, totalValue: bv, createdAt: t.buyTime, updatedAt: t.buyTime });
        await OrdersModel.create({ _id: so, stockSymbol: t.symbol, quantity: qty, price: t.sellPrice, type: 'MARKET', side: 'SELL', status: 'EXECUTED', productType: 'NRML', createdAt: t.sellTime, updatedAt: t.sellTime });
        await TradeModel.create({ stockSymbol: t.symbol, quantity: qty, price: t.sellPrice, side: 'SELL', productType: 'NRML', orderId: so, charges: Math.round(ch * 0.6 * 100) / 100, totalValue: sv, createdAt: t.sellTime, updatedAt: t.sellTime });

        totalPnl += pn;
        totalTurnover += bv + sv;

        const ibuy = t.buyTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const isell = t.sellTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const ps = pn >= 0 ? `\\x1b[32m+₹${(pn/100000).toFixed(2)}L\\x1b[0m` : `\\x1b[31m-₹${(Math.abs(pn)/100000).toFixed(2)}L\\x1b[0m`;
        rows.push({ symbol: t.symbol, lots: t.lots, buy: `${ibuy} @ ₹${t.buyPrice}`, sell: `${isell} @ ₹${t.sellPrice}`, pnl: ps });
    }

    console.log('Symbol'.padEnd(30) + 'Lots'.padEnd(7) + 'BUY Time & Price'.padEnd(26) + 'SELL Time & Price'.padEnd(26) + 'P&L');
    console.log('─'.repeat(110));
    for (const r of rows) console.log(r.symbol.padEnd(30) + String(r.lots).padEnd(7) + r.buy.padEnd(26) + r.sell.padEnd(26) + r.pnl);

    const exact = Math.round(totalPnl);
    const cr = Math.floor(Math.abs(exact) / 10000000);
    const lk = Math.floor((Math.abs(exact) % 10000000) / 100000);
    const th = Math.floor((Math.abs(exact) % 100000) / 1000);
    const hd = Math.abs(exact) % 1000;
    console.log('\\n' + '═'.repeat(110));
    console.log(`Total turnover : ₹${(totalTurnover/10000000).toFixed(4)} crore`);
    console.log(`NET P&L        : ${exact < 0 ? '-' : '+'}₹${cr} crore ${lk} lakh ${th} thousand ${hd} rupees`);
    console.log(`NET P&L (₹)    : ${exact < 0 ? '-' : '+'}₹${Math.abs(exact).toLocaleString('en-IN')}`);
    console.log('═'.repeat(110));
    await mongoose.disconnect();
    console.log('\\n✓ Done');
}

seed().catch(e => { console.error('\\n✗', e.message); process.exit(1); });
""")

print("\n✓ Written backend/seedOptionTrades.js")