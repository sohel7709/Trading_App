const { AuditLogModel } = require('../schema/AuditLogSchema');

/**
 * Log an audit event.
 * @param {Object} params
 * @param {String} params.actorUserId - The ID of the user performing the action
 * @param {String} params.action - The action being performed (e.g., 'LOGIN', 'LOGOUT', 'UPDATE_PROFILE')
 * @param {String} params.entityType - The type of entity being acted upon (e.g., 'User', 'Session')
 * @param {String} params.entityId - The ID of the entity being acted upon
 * @param {Object} [params.before] - The state of the entity before the action
 * @param {Object} [params.after] - The state of the entity after the action
 * @param {Object} [req] - The Express request object to extract IP and user agent
 */
async function logAudit({ actorUserId, action, entityType, entityId, before = null, after = null }, req = null) {
  try {
    const ip = req ? (req.ip || req.connection.remoteAddress) : '';
    const userAgent = req ? req.headers['user-agent'] : '';

    await AuditLogModel.create({
      actorUserId,
      action,
      entityType,
      entityId,
      before,
      after,
      ip,
      userAgent,
    });
  } catch (error) {
    console.error('[AuditLogger] Failed to write audit log:', error.message);
  }
}

module.exports = {
  logAudit,
};
