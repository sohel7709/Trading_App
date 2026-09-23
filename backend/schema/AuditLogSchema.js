'use strict';

const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    // Actor info
    actorId: { type: String, default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    role: { type: String, default: 'SUPER_ADMIN', index: true },

    // Action & Entity
    action: { type: String, required: true, index: true }, // e.g., 'CREATE_INSTITUTE', 'UPDATE_PLAN', 'SUSPEND_INSTITUTE'
    entity: { type: String, default: '', index: true },    // e.g., 'Institute', 'User', 'Batch'
    entityId: { type: String, default: null, index: true },
    instituteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', index: true },

    // State Changes (Before & After)
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },

    // Network & Context
    ip: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

AuditLogSchema.index({ instituteId: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ role: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

module.exports = AuditLogSchema;
