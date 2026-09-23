const { Schema } = require('mongoose');

const BranchSchema = new Schema({
  name: { type: String, required: true },
  instituteCode: { type: String, required: true }, // Ties to Institute
  location: { type: String },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  managerId: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Prevent duplicate branches in same institute
BranchSchema.index({ instituteCode: 1, name: 1 }, { unique: true });

module.exports = { BranchSchema };
