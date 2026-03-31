const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const socketService = require('./services/socketService');
const sequelize = require('./config/database');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({ origin: '*' })); // Permissive CORS for development
app.use(express.json());

// Main REST Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
const groupRoutes = require('./routes/groupRoutes');
app.use('/api/groups', groupRoutes);

// Root endpoint for testing
app.get('/', (req, res) => res.send('Secure Chat API running'));

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
socketService(io); // Initialize socket handlers

// DB Connection
sequelize.sync({ alter: true })
  .then(() => console.log('PostgreSQL database synced successfully'))
  .catch(err => console.error('Database sync error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
