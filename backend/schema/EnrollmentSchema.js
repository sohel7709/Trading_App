const { Schema } = require('mongoose');

const EnrollmentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
  instituteCode: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['ACTIVE', 'REMOVED', 'COMPLETED'], 
    default: 'ACTIVE' 
  },
  joinedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// A user can only be enrolled in a specific batch once
EnrollmentSchema.index({ userId: 1, batchId: 1 }, { unique: true });
// Fast lookup for all enrollments in a batch (needed for live grid)
EnrollmentSchema.index({ batchId: 1, status: 1 });

module.exports = { EnrollmentSchema };
