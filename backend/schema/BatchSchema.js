const { Schema } = require('mongoose');

const BatchSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  instituteCode: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  startingCapitalPaise: { type: Number, default: 10000000 }, // 1 Lakh default
  marketMode: { 
    type: String, 
    enum: ['LIVE', 'DELAYED', 'REPLAY', 'EOD', 'SYNTHETIC'], 
    default: 'LIVE' 
  },
  isHalted: { type: Boolean, default: false },
  haltReason: { type: String, default: null },
  haltedAt: { type: Date, default: null },
  haltedBy: { type: String, default: null },
  status: { 
    type: String, 
    enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], 
    default: 'DRAFT' 
  },
  instructors: [{ type: Schema.Types.ObjectId, ref: 'User' }], // Array of INSTRUCTOR userIds
}, { timestamps: true });

// Multi-tenant indexing
BatchSchema.index({ instituteCode: 1, code: 1 }, { unique: true });

module.exports = { BatchSchema };
