const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET; // Guaranteed set by server.js startup check
const userSockets = new Map(); // Map userId -> socketId

// Helper: get all userIds that a given user has chatted with
async function getContactIds(userId) {
  const rows = await Message.findAll({
    where: { [Op.or]: [{ senderId: userId }, { recipientId: userId }] },
    attributes: ['senderId', 'recipientId'],
    raw: true,
  });
  const ids = new Set();
  rows.forEach(r => {
    if (r.senderId !== userId) ids.add(r.senderId);
    if (r.recipientId !== userId) ids.add(r.recipientId);
  });
  return Array.from(ids);
}

module.exports = (io) => {
  // --- Authentication middleware for socket ---
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: token missing'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') return next(new Error('Authentication error: token expired'));
      next(new Error('Authentication error: invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    userSockets.set(socket.userId, socket.id);

    // Each user joins their own private room for targeted status broadcasts
    socket.join(`user:${socket.userId}`);

    // Update online status & notify only existing contacts (privacy)
    await User.update({ online: true }, { where: { id: socket.userId } });
    try {
      const contactIds = await getContactIds(socket.userId);
      contactIds.forEach(contactId => {
        io.to(`user:${contactId}`).emit('userStatusChange', { userId: socket.userId, online: true });
      });
    } catch (e) { console.error('[socket] getContactIds error', e); }

    // ── Direct Message ──────────────────────────────────────────────
    socket.on('sendMessage', async (data) => {
      try {
        const { recipientId, encryptedContent, encryptedAesKeyForSender, encryptedAesKeyForRecipient, iv, replyToId } = data;

        if (!recipientId || !encryptedContent || !encryptedAesKeyForRecipient || !iv) {
          return socket.emit('error', { message: 'Dữ liệu tin nhắn không hợp lệ' });
        }

        const message = await Message.create({
          senderId: socket.userId,
          recipientId,
          encryptedContent,
          encryptedAesKeyForSender,
          encryptedAesKeyForRecipient,
          iv,
          replyToId: replyToId || null,
        });

        const messageData = {
          id: message.id,
          senderId: socket.userId,
          recipientId,
          encryptedContent,
          encryptedAesKeyForSender,
          encryptedAesKeyForRecipient,
          iv,
          replyToId: replyToId || null,
          isDeleted: false,
          reactions: {},
          readAt: null,
          createdAt: message.createdAt,
        };

        socket.emit('newMessage', messageData);

        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('newMessage', messageData);
        }
      } catch (error) {
        console.error('[socket] sendMessage error:', error);
      }
    });

    // ── Delete Message ──────────────────────────────────────────────
    socket.on('deleteMessage', async ({ messageId, recipientId }) => {
      try {
        const msg = await Message.findByPk(messageId);
        // Only the sender can revoke their own message
        if (!msg || msg.senderId !== socket.userId) return;

        await msg.update({
          isDeleted: true,
          encryptedContent: null,
          encryptedAesKeyForSender: null,
          encryptedAesKeyForRecipient: null,
          iv: null,
        });

        const payload = { messageId, isDeleted: true };
        socket.emit('messageDeleted', payload);

        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('messageDeleted', payload);
        }
      } catch (err) {
        console.error('[socket] deleteMessage error:', err);
      }
    });

    // ── React to Message ─────────────────────────────────────────────
    socket.on('reactMessage', async ({ messageId, recipientId, reaction }) => {
      try {
        const msg = await Message.findByPk(messageId);
        if (!msg || msg.isDeleted) return;

        // Security: only participants of this conversation can react
        if (msg.senderId !== socket.userId && msg.recipientId !== socket.userId) {
          return socket.emit('error', { message: 'Không được phép react tin nhắn này' });
        }

        const currentReactions = { ...msg.reactions } || {};
        if (!reaction) {
          delete currentReactions[socket.userId];
        } else {
          currentReactions[socket.userId] = reaction;
        }

        await msg.update({ reactions: currentReactions });

        const payload = { messageId, reactions: currentReactions };
        socket.emit('messageReacted', payload);
        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('messageReacted', payload);
        }
      } catch (err) {
        console.error('[socket] reactMessage error:', err);
      }
    });

    // ── Mark as Read ─────────────────────────────────────────────────
    socket.on('markAsRead', async ({ senderId }) => {
      try {
        await Message.update(
          { readAt: new Date() },
          { where: { senderId, recipientId: socket.userId, readAt: null } }
        );
        const senderSocketId = userSockets.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messagesRead', { byUserId: socket.userId });
        }
      } catch (err) {
        console.error('[socket] markAsRead error:', err);
      }
    });

    // ── Typing Indicators ────────────────────────────────────────────
    socket.on('typing', ({ recipientId }) => {
      const recipientSocketId = userSockets.get(recipientId);
      if (recipientSocketId) io.to(recipientSocketId).emit('typing', { senderId: socket.userId });
    });

    socket.on('stopTyping', ({ recipientId }) => {
      const recipientSocketId = userSockets.get(recipientId);
      if (recipientSocketId) io.to(recipientSocketId).emit('stopTyping', { senderId: socket.userId });
    });

    // ── WebRTC Signaling ─────────────────────────────────────────────
    socket.on('callUser', (data) => {
      const toSocket = userSockets.get(data.userToCall);
      if (toSocket) {
        io.to(toSocket).emit('incomingCall', { signal: data.signal, from: socket.userId, isVideo: data.isVideo });
      }
    });

    socket.on('answerCall', (data) => {
      const toSocket = userSockets.get(data.to);
      if (toSocket) io.to(toSocket).emit('callAccepted', data.signal);
    });

    socket.on('iceCandidate', (data) => {
      const toSocket = userSockets.get(data.to);
      if (toSocket) io.to(toSocket).emit('iceCandidate', data.candidate);
    });

    socket.on('endCall', (data) => {
      const toSocket = userSockets.get(data.to);
      if (toSocket) io.to(toSocket).emit('callEnded');
    });

    socket.on('rejectCall', (data) => {
      const toSocket = userSockets.get(data.to);
      if (toSocket) io.to(toSocket).emit('callRejected');
    });

    // ── Disconnect ───────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      userSockets.delete(socket.userId);
      await User.update({ online: false, lastSeenAt: new Date() }, { where: { id: socket.userId } });
      try {
        const contactIds = await getContactIds(socket.userId);
        contactIds.forEach(contactId => {
          io.to(`user:${contactId}`).emit('userStatusChange', { userId: socket.userId, online: false });
        });
      } catch (e) { console.error('[socket] disconnect getContactIds error', e); }
    });
  });
};
