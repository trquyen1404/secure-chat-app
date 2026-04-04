const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const socketService = require('./services/socketService');
const sequelize = require('./config/database');

dotenv.config();

// --- Environment validation ---
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// --- Security Headers (helmet) ---
app.use(helmet({
  crossOriginEmbedderPolicy: false, // needed for WebRTC & media blobs
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

// --- CORS (whitelist from .env) ---
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., curl, Postman) only in development
    if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (origin && ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS policy violation: origin '${origin}' not allowed`));
  },
  credentials: true,
}));

// --- Body Parsing ---
app.use(cookieParser());
app.use(express.json({ limit: '10mb' })); // cap body size; image data URLs need headroom

// --- Rate Limiting ---
// General limiter for all API routes
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' },
}));

// Strict limiter for auth endpoints (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // 15 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.' },
});

// --- Routes ---
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/friends', require('./routes/friendRoutes'));
app.use('/api/groups', require('./routes/groupRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/stories', require('./routes/storyRoutes'));
app.use('/api/push', require('./routes/pushRoutes'));

// Root endpoint for testing
app.get('/', (req, res) => res.send('Secure Chat API running'));

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// --- Socket.IO ---
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
socketService(io);

// --- Database ---
const syncOptions = process.env.NODE_ENV === 'production'
  ? {} // Do NOT alter schema in production — use migrations
  : { alter: true };

sequelize.sync(syncOptions)
  .then(() => console.log(`PostgreSQL synced (mode: ${process.env.NODE_ENV || 'development'})`))
  .catch(err => { console.error('Database sync error:', err); process.exit(1); });

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
