'use strict';

const AuditLogModel = require('../model/AuditLogModel');

/**
 * Log compliance / audit event safely without blocking main workflow
 */
async function logAudit({ userId, instituteId, action, ipAddress, userAgent, details }) {
    try {
        const entry = new AuditLogModel({
            userId: userId || null,
            instituteId: instituteId || null,
            action,
            ipAddress: ipAddress || '',
            userAgent: userAgent || '',
            details: details || {},
        });
        await entry.save();
        return entry;
    } catch (err) {
        console.warn('[AuditService] Failed to write audit log:', err.message);
        return null;
    }
}

/**
 * Log governance & Super Admin action safely
 */
async function logAction({ actorId, role, action, entity, entityId, before, after, ip, userAgent, instituteId, userId, details }) {
    try {
        const entry = new AuditLogModel({
            actorId: actorId ? String(actorId) : (userId ? String(userId) : 'SYSTEM'),
            userId: userId || null,
            role: role || 'SUPER_ADMIN',
            action,
            entity: entity || '',
            entityId: entityId ? String(entityId) : null,
            instituteId: instituteId || null,
            before: before || null,
            after: after || null,
            ip: ip || '',
            ipAddress: ip || '',
            userAgent: userAgent || '',
            details: details || {},
        });
        await entry.save();
        return entry;
    } catch (err) {
        console.warn('[AuditService] Failed to write action log:', err.message);
        return null;
    }
}

module.exports = {
    logAudit,
    logAction,
};
