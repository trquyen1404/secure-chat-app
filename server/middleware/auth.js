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
    const user = await User.findByPk(decoded.userId, { attributes: ['id', 'tokenVersion'] });
    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Token đã bị thu hồi hoặc phiên đã đổi. Vui lòng đăng nhập lại.' });
    }

    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    res.status(401).json({ error: 'Token không hợp lệ.' });
  }
};

module.exports = auth;
