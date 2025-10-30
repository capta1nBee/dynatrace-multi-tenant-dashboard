const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

const monitorMiddleware = (req, res, next) => {
  if (!['ADMIN', 'MONITOR'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Monitor access required' });
  }
  next();
};

// Optional auth middleware - doesn't require token but extracts user info if available
const optionalAuthMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      console.log('[AUTH] Optional auth - User authenticated:', decoded.username);
    } else {
      console.log('[AUTH] Optional auth - No token provided, allowing public access');
    }
  } catch (error) {
    console.log('[AUTH] Optional auth - Invalid token, allowing public access');
  }
  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  monitorMiddleware,
  optionalAuthMiddleware,
};

