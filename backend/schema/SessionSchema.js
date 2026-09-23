const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
    },
    deviceLabel: { type: String, default: 'Unknown Device' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // MongoDB TTL auto-removes expired sessions
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = { SessionSchema };
