'use strict';

const mongoose = require('mongoose');
const AuditLogSchema = require('../schema/AuditLogSchema');

const AuditLogModel = mongoose.model('AuditLog', AuditLogSchema);

module.exports = AuditLogModel;
