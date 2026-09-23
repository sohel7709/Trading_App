const mongoose = require('mongoose');

const CandleSchema = new mongoose.Schema({
  instrumentId: { type: String, required: true, index: true },
  resolution: { type: String, required: true, index: true }, // e.g. "1", "5", "D"
  ts: { type: Number, required: true, index: true }, // Timestamp
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, default: 0 },
}, { timestamps: true });

// Compound index for fast querying of ranges
CandleSchema.index({ instrumentId: 1, resolution: 1, ts: 1 }, { unique: true });

module.exports = CandleSchema;
