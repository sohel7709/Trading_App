const mongoose = require('mongoose');

const OptionSideSchema = new mongoose.Schema({
  ltp: { type: Number, required: true },
  oi: { type: Number, required: true },
  iv: { type: Number, required: true },
  volume: { type: Number, default: 0 },
  change: { type: Number, default: 0 }
}, { _id: false });

const OptionStrikeSchema = new mongoose.Schema({
  strike: { type: Number, required: true },
  isATM: { type: Boolean, default: false },
  ce: { type: OptionSideSchema, required: true },
  pe: { type: OptionSideSchema, required: true }
}, { _id: false });

const OptionChainSnapSchema = new mongoose.Schema({
  indexName: { type: String, required: true, index: true },
  expiry: { type: String, required: true, index: true },
  ts: { type: Number, required: true, index: true }, // Snap timestamp
  underlyingPrice: { type: Number, required: true },
  rows: [OptionStrikeSchema],
}, { timestamps: true });

// Compound index for querying snapshots for replay
OptionChainSnapSchema.index({ indexName: 1, expiry: 1, ts: 1 }, { unique: true });

module.exports = OptionChainSnapSchema;
