/**
 * Security Logging Middleware
 */
const { User } = require('../models');

const logActivity = (event, details = {}) => {
  console.log(`[LOG][${new Date().toISOString()}] ${event}:`, details);
  // In production, save this to a dedicated Logs table or a service like Winston/ELK
};

const activityLogger = (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  req.userIp = ip;
  
  // Attach logging function to response finish
  res.on('finish', () => {
    if (res.statusCode >= 400 && req.path.includes('auth')) {
      logActivity('SECURITY_ALERT', {
        path: req.path,
        method: req.method,
        status: res.statusCode,
        ip,
        userId: req.userId || 'anonymous'
      });
    }
  });
  
  next();
};

module.exports = {
  logActivity,
  activityLogger
};
