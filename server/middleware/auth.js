const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET; // Guaranteed set by server.js startup check

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token xác thực bị thiếu hoặc không đúng định dạng' });
    }
    const token = authHeader.slice(7); // Remove 'Bearer ' prefix cleanly
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // [Security Hardening] Verify tokenVersion to support global logout/revocation
    const user = await User.findByPk(decoded.userId, { 
      attributes: ['id', 'role', 'tokenVersion', 'isBanned', 'banReason', 'isVerified'] 
    });
    
    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Token đã bị thu hồi hoặc phiên đã đổi. Vui lòng đăng nhập lại.' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa', reason: user.banReason });
    }

    // Require email verification for all APIs except verification endpoints and logout
    if (!user.isVerified && 
        !req.originalUrl.includes('/verify-email') && 
        !req.originalUrl.includes('/resend-code') && 
        !req.originalUrl.includes('/logout')) {
      return res.status(403).json({ error: 'Tài khoản chưa được xác thực email. Vui lòng xác thực trước.', isUnverified: true });
    }

    req.userId = user.id;
    req.user = user; // Full user context for RBAC
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    res.status(401).json({ error: 'Token không hợp lệ.' });
  }
};

module.exports = auth;
