const { Schema } = require('mongoose');

const AssignmentSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
  title: { type: String, required: true },
  description: { type: String },
  dueDate: { type: Date, required: true },
  autoClose: { type: Boolean, default: false },
  status: { type: String, enum: ['ACTIVE', 'CLOSED'], default: 'ACTIVE' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = { AssignmentSchema };
