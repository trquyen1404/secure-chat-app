const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const sanitizeHtml = require('sanitize-html');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req, res) => {
    if (req.headers['x-test-rate-limit'] === 'true') {
      return 5; // limit to 5 requests for testing rate limiting
    }
    return process.env.NODE_ENV === 'development' ? 10000 : 100;
  },
  keyGenerator: (req) => {
    return req.headers['x-test-rate-limit-key'] || req.ip;
  },
  validate: {
    keyGeneratorIpFallback: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

// Stricter limiter for authentication routes (Login/Register)
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req, res) => {
    if (req.headers['x-test-rate-limit'] === 'true') {
      return 5; // limit to 5 requests for testing auth rate limiting
    }
    return 1000;
  },
  keyGenerator: (req) => {
    return req.headers['x-test-rate-limit-key'] || req.ip;
  },
  validate: {
    keyGeneratorIpFallback: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again after an hour' }
});

const resendCodeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req, res) => {
    if (req.headers['x-test-rate-limit'] === 'true') {
      return 5;
    }
    return 5;
  },
  keyGenerator: (req) => {
    return req.userId || req.headers['x-test-rate-limit-key'] || req.ip;
  },
  validate: {
    keyGeneratorIpFallback: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification code requests, please try again after an hour' }
});

const securityMiddleware = (app) => {
  // Helmet for security headers
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        imgSrc: ["'self'", "data:", "blob:", "https://*"],
        mediaSrc: ["'self'", "data:", "blob:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    },
    noSniff: true,
    xssFilter: true,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'same-origin' }
  }));

  // HTTP Parameter Pollution (HPP) simple prevention middleware
  app.use((req, res, next) => {
    const cleanParams = (params) => {
      if (typeof params !== 'object' || params === null) return;
      for (let key in params) {
        if (Array.isArray(params[key])) {
          // Keep only the last parameter value to prevent query array pollution
          params[key] = params[key][params[key].length - 1];
        }
      }
    };
    cleanParams(req.query);
    next();
  });

  // Advanced request sanitization using sanitize-html, bypassing E2EE fields
  const E2EE_FIELDS = new Set([
    'encryptedContent',
    'ratchetKey',
    'iv',
    'signature',
    'publicKey',
    'dhPublicKey',
    'senderEk',
    'usedOpk',
    'encryptedPrivateKey',
    'keyBackupSalt',
    'keyBackupIv',
    'vaultData'
  ]);

  app.use((req, res, next) => {
    const sanitize = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;
      for (let key in obj) {
        if (E2EE_FIELDS.has(key)) continue;
        if (typeof obj[key] === 'string') {
          obj[key] = sanitizeHtml(obj[key], {
            allowedTags: [],
            allowedAttributes: {}
          });
        } else if (typeof obj[key] === 'object') {
          sanitize(obj[key]);
        }
      }
      return obj;
    };
    
    sanitize(req.body);
    sanitize(req.query);
    next();
  });
};

module.exports = {
  securityMiddleware,
  apiLimiter,
  authLimiter,
  resendCodeLimiter
};
