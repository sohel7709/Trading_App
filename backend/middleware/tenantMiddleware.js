'use strict';

/**
 * Tenant & RBAC Security Middleware
 * ─────────────────────────────────
 * Enforces strict multi-tenant boundary checks across database queries,
 * API requests, and user roles.
 */

/**
 * Attach institute identity and tenant scoping to request
 */
function attachInstitute(req, res, next) {
    if (req.user) {
        req.instituteId = req.user.instituteId ? req.user.instituteId.toString() : null;
        req.tenantId = req.user.instituteCode || (req.instituteId ? String(req.instituteId) : 'ADMIN');

        // Super Admin privilege: can inspect or target specific institutes via header or query
        if (req.user.role === 'SUPER_ADMIN') {
            const targetInstitute = req.headers['x-institute-id'] || req.query.instituteId;
            if (targetInstitute) {
                req.instituteId = String(targetInstitute);
            }
        }
    } else {
        req.instituteId = null;
        req.tenantId = 'ADMIN';
    }
    next();
}

/**
 * Enforce that the user must belong to an active institute
 * (SUPER_ADMIN is exempt and can access globally)
 */
function enforceInstitute(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    if (req.user.role === 'SUPER_ADMIN') {
        return next();
    }

    if (!req.instituteId) {
        return res.status(403).json({ 
            message: 'Forbidden: User is not assigned to any registered institute' 
        });
    }

    next();
}

/**
 * Role-Based Access Control (RBAC) Guard
 * Usage:
 *   router.get('/route', auth, allowRoles('SUPER_ADMIN', 'INSTITUTE_ADMIN'), handler)
 */
function allowRoles(...allowedRoles) {
    const flattened = allowedRoles.flat().map(r => r.toUpperCase());

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const userRole = (req.user.role || '').toUpperCase();

        // Always allow SUPER_ADMIN unless explicitly restricted
        if (userRole === 'SUPER_ADMIN') {
            return next();
        }

        // Map legacy role names: ADMIN -> INSTITUTE_ADMIN
        const effectiveRole = userRole === 'ADMIN' ? 'INSTITUTE_ADMIN' : userRole;

        const isAllowed = flattened.includes(userRole) 
            || flattened.includes(effectiveRole)
            || (flattened.includes('INSTITUTE_ADMIN') && userRole === 'ADMIN');

        if (!isAllowed) {
            return res.status(403).json({ 
                message: `Forbidden: Access requires one of [${flattened.join(', ')}]`,
                userRole: userRole 
            });
        }

        next();
    };
}

/**
 * Build tenant-scoped query filter for MongoDB models
 * Example:
 *   const filter = scopeTenant(req, { status: 'PENDING' });
 *   // Returns { status: 'PENDING', instituteId: '...' } (or un-scoped if SUPER_ADMIN without target)
 */
function scopeTenant(req, query = {}) {
    if (!req.user) return query;

    // Super Admin with no explicit institute targets sees all
    if (req.user.role === 'SUPER_ADMIN' && !req.headers['x-institute-id'] && !req.query.instituteId) {
        return query;
    }

    if (req.instituteId) {
        return {
            ...query,
            instituteId: req.instituteId,
        };
    }

    return query;
}

module.exports = {
    attachInstitute,
    enforceInstitute,
    allowRoles,
    scopeTenant,
};
