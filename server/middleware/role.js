/**
 * Role-Based Access Control Middleware
 * @param {...string} allowedRoles - List of roles permitted to access the route
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Role '${req.user.role}' is not authorized to access this resource.` 
      });
    }

    if (req.user.isBanned) {
      return res.status(403).json({ 
        error: 'Account banned', 
        reason: req.user.banReason 
      });
    }

    next();
  };
};

module.exports = {
  authorizeRoles,
  isAdmin: authorizeRoles('admin'),
  isTeacher: authorizeRoles('teacher', 'admin'),
  isStudent: authorizeRoles('student', 'teacher', 'admin'),
};
