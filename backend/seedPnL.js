require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { TradeModel } = require('./model/TradeModel');

const CSV_PATH = path.join(__dirname, '../Zerodha_Realistic_Trade_History_Nov25_Jun26.csv');

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i]?.trim() || ''; });
    return row;
  });
}

function getProductType(symbol) {
  if (/\d+(CE|PE)$/.test(symbol)) return 'NRML';
  if (/FUT$/.test(symbol)) return 'NRML';
  if (/^(NIFTY|BANKNIFTY|SENSEX|FINNIFTY|MIDCPNIFTY)/.test(symbol)) return 'NRML';
  return 'CNC';
}

async function seed() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log('Connected to MongoDB');

  const deleted = await TradeModel.deleteMany({});
  console.log(`Cleared ${deleted.deletedCount} existing trades`);

  const rows = parseCSV(CSV_PATH);
  console.log(`Parsed ${rows.length} CSV rows`);

  const trades = [];
  let skipped = 0;

  for (const row of rows) {
    const symbol    = row['Symbol'];
    const qty       = parseFloat(row['Quantity']);
    const buyVal    = parseFloat(row['Buy Value']);
    const sellVal   = parseFloat(row['Sell Value']);
    const charges   = parseFloat(row['Charges']) || 0;
    const tradeDate = new Date(row['Trade Date']);

    if (!symbol || isNaN(qty) || qty <= 0) { skipped++; continue; }

    const productType = getProductType(symbol);
    const buyAvg  = buyVal  > 0 ? buyVal  / qty : 0;
    const sellAvg = sellVal > 0 ? sellVal / qty : 0;

    if (buyVal > 0 && buyAvg > 0) {
      const buyTime = new Date(tradeDate);
      buyTime.setHours(9, 15, 0, 0);
      trades.push({
        stockSymbol: symbol,
        quantity:    qty,
        price:       parseFloat(buyAvg.toFixed(4)),
        side:        'BUY',
        productType,
        charges:     parseFloat((charges * 0.4).toFixed(2)),
        totalValue:  parseFloat(buyVal.toFixed(2)),
        createdAt:   buyTime,
        updatedAt:   buyTime,
      });
    }

    if (sellVal > 0 && sellAvg > 0) {
      const sellTime = new Date(tradeDate);
      sellTime.setHours(15, 20, 0, 0);
      trades.push({
        stockSymbol: symbol,
        quantity:    qty,
        price:       parseFloat(sellAvg.toFixed(4)),
        side:        'SELL',
        productType,
        charges:     parseFloat((charges * 0.6).toFixed(2)),
        totalValue:  parseFloat(sellVal.toFixed(2)),
        createdAt:   sellTime,
        updatedAt:   sellTime,
      });
    }
  }

  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < trades.length; i += batchSize) {
    await TradeModel.insertMany(trades.slice(i, i + batchSize), { timestamps: false });
    inserted += trades.slice(i, i + batchSize).length;
    process.stdout.write(`\rInserted ${inserted}/${trades.length} trades...`);
  }

  console.log(`\n\nSeed complete! ${rows.length} rows → ${inserted} trade documents (${skipped} skipped)`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
