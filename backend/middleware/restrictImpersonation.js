'use strict';

/**
 * restrictImpersonation.js
 * ─────────────────────────────────────────────────────────────
 * Middleware protecting critical operations when an administrator is in Support / Impersonation Mode.
 * Ensures support admins cannot accidentally delete data or alter security credentials.
 */

function restrictImpersonation(actionName = 'This action') {
    return (req, res, next) => {
        if (req.user && req.user.isImpersonating) {
            return res.status(403).json({
                success: false,
                message: `${actionName} is prohibited while in Support / Impersonation Mode.`,
                isImpersonating: true,
            });
        }
        next();
    };
}

module.exports = { restrictImpersonation };
