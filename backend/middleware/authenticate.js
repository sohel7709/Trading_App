const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { UserModel } = require('../model/UserModel');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'zerodha_access_secret_change_in_prod';

/**
 * Verifies the Bearer JWT from Authorization header.
 * Attaches req.user = full Mongoose user document.
 */
async function authenticate(req, res, next) {
  try {
    const isPublicPath = 
      req.path === '/' ||
      req.path === '/health' ||
      req.path.startsWith('/dhan/token-postback') ||
      (req.method === 'GET' && req.path.startsWith('/market'));

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (isPublicPath) {
        req.user = null;
        return next();
      }
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, ACCESS_SECRET);
    } catch {
      if (isPublicPath) {
        req.user = null;
        return next();
      }
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const idCandidate = payload.sub || payload.userId || payload._id || payload.id;
    let user = null;
    if (mongoose.Types.ObjectId.isValid(idCandidate)) {
      user = await UserModel.findById(idCandidate).select('-passwordHash');
    }
    if (!user && (payload.userId || typeof idCandidate === 'string')) {
      user = await UserModel.findOne({ userId: payload.userId || idCandidate }).select('-passwordHash');
    }
    if (!user || !user.isActive)
      return res.status(401).json({ message: 'User not found or inactive' });

    req.user = user; // full user doc available to all downstream handlers
    req.user.isImpersonating = Boolean(payload.isImpersonating);
    req.user.impersonatedBy = payload.impersonatedBy || null;
    req.instituteId = user.instituteId ? user.instituteId.toString() : null;
    req.tenantId = user.instituteCode || (req.instituteId ? String(req.instituteId) : 'ADMIN');
    next();
  } catch (err) {
    console.error('[Auth] authenticate middleware error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = { authenticate };
