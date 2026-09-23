const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      default: 'Trader',
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR', 'STUDENT', 'TRADER'],
      default: 'STUDENT',
    },
    instituteId: {
      type: require('mongoose').Schema.Types.ObjectId,
      ref: 'Institute',
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: true, // skip email verification for this demo
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    instituteCode: {
      type: String,
      default: '',
    },
    // Profile fields
    pan: { type: String, default: '' },
    phone: { type: String, default: '' },
    dematId: { type: String, default: '' },
    bankAccount: { type: String, default: '' },
    // Advanced Auth
    seatLimit: { type: Number, default: 2 },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = { UserSchema };
