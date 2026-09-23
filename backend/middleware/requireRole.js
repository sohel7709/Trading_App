/**
 * RBAC guard — restricts route to specific roles.
 * Must be used AFTER the authenticate middleware.
 *
 * Usage:
 *   app.delete('/admin/user/:id', authenticate, requireRole(['ADMIN']), handler)
 */
function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user)
      return res.status(401).json({ message: 'Not authenticated' });

    if (!roles.includes(req.user.role))
      return res.status(403).json({ message: 'Forbidden: insufficient role' });

    next();
  };
}

module.exports = { requireRole };
