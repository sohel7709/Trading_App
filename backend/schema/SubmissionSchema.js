const { Schema } = require('mongoose');

const SubmissionSchema = new Schema({
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['PENDING', 'SUBMITTED', 'GRADED'], default: 'PENDING' },
  content: { type: String }, // Links, notes, etc.
  screenshotUrl: { type: String },
  grade: { type: Number },
  feedback: { type: String },
  submittedAt: { type: Date }
}, { timestamps: true });

// One submission per user per assignment
SubmissionSchema.index({ assignmentId: 1, userId: 1 }, { unique: true });

module.exports = { SubmissionSchema };
