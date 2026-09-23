const { Schema } = require('mongoose');

const RiskRuleSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, unique: true },
  instituteCode: { type: String, required: true },
  
  maxDailyLossPaise: { type: Number, default: null }, // e.g., 500000 for 5000 Rs
  maxPositionValuePaise: { type: Number, default: null }, // max value per position
  maxOpenPositions: { type: Number, default: null }, // max number of concurrent open positions
  mandatoryStopLoss: { type: Boolean, default: false }, // if true, every order must have a SL leg
  allowedSegments: [{ type: String, enum: ['EQUITY', 'FNO', 'COMMODITY', 'CURRENCY'] }], // default to all if empty
  maxLeverage: { type: Number, default: 1 }, // e.g., 5x leverage allowed
  
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = { RiskRuleSchema };
