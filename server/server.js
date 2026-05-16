const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const socketService = require('./services/socketService');
const db = require('./models');

// ── Environment Validation ──────────────────────────────────────────
dotenv.config();

const REQUIRED_ENV = [
  'JWT_SECRET', 
  'JWT_REFRESH_SECRET', 
  'DATABASE_URL', 
  'ALLOWED_ORIGINS', 
  'NODE_ENV'
];

const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const { securityMiddleware, apiLimiter, authLimiter } = require('./security/protector');

const app = express();
const server = http.createServer(app);

// Apply centralized security configurations
securityMiddleware(app);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (origin && ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS policy violation: origin '${origin}' not allowed`));
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// API Routes with rate limiting
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api', apiLimiter); // Apply general limit to all other /api routes

app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/groups', require('./routes/groupRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/assignments', require('./routes/assignmentRoutes'));
app.use('/api/polls', require('./routes/pollRoutes'));
app.use('/api/resources', require('./routes/resourceRoutes'));
app.use('/api/schedules', require('./routes/scheduleRoutes'));
app.use('/api/academic', require('./routes/academicRoutes'));
app.use('/api/super-app', require('./routes/superAppRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/friends', require('./routes/friendRoutes'));

app.get('/', (req, res) => res.send('UTT Secure Chat API running'));

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const io = new Server(server, {
  maxHttpBufferSize: 1e7, // 10MB limit for E2EE file attachments
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
socketService(io);

db.sequelize.sync({ alter: true })
  .then(async () => {
    console.log(`PostgreSQL synced (mode: ${process.env.NODE_ENV || 'development'})`);
    // Ensure UTT Bot exists
    const { User: UserModel } = require('./models');
    await UserModel.findOrCreate({
      where: { username: 'utt_assistant' },
      defaults: {
        username: 'utt_assistant',
        displayName: 'Trợ lý ảo UTT 🤖',
        email: 'assistant@utt.edu.vn',
        password: 'virtual_user_no_login',
        publicKey: 'BOT_VIRTUAL_KEY',
        dhPublicKey: 'BOT_VIRTUAL_KEY',
        role: 'bot',
        isVerified: true
      }
    });
  })
  .catch(err => { console.error('Database sync error:', err); process.exit(1); });

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
