const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET;
const userSockets = new Map();

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
    socket.join(`user:${socket.userId}`);

    await User.update({ online: true }, { where: { id: socket.userId } });
    try {
      const contactIds = await getContactIds(socket.userId);
      contactIds.forEach(contactId => {
        io.to(`user:${contactId}`).emit('userStatusChange', { userId: socket.userId, online: true });
      });
    } catch (e) {}

    socket.on('sendMessage', async (data) => {
      try {
        const { recipientId, encryptedContent, ratchetKey, n, pn, iv, replyToId, senderEk, usedOpk, localId } = data;
        if (!recipientId || !encryptedContent || !iv) return socket.emit('error', { message: 'Invalid message data' });

        const message = await Message.create({
          senderId: socket.userId,
          recipientId,
          encryptedContent,
          ratchetKey,
          n,
          pn,
          iv,
          replyToId: replyToId || null,
          senderEk: senderEk || null,
          usedOpk: usedOpk || null,
        });

        const messageData = {
          id: message.id,
          localId: localId || null,
          senderId: socket.userId,
          recipientId,
          encryptedContent,
          ratchetKey,
          n,
          pn,
          iv,
          senderEk: senderEk || null,
          usedOpk: usedOpk || null,
          replyToId: replyToId || null,
          isDeleted: false,
          reactions: {},
          readAt: null,
          createdAt: message.createdAt,
        };

        socket.emit('newMessage', messageData);
        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) io.to(recipientSocketId).emit('newMessage', messageData);
      } catch (error) {
        console.error('[socket] sendMessage error:', error);
      }
    });

    socket.on('deleteMessage', async ({ messageId, recipientId }) => {
      try {
        const msg = await Message.findByPk(messageId);
        if (!msg || msg.senderId !== socket.userId) return;

        await msg.update({
          isDeleted: true,
          encryptedContent: null,
          ratchetKey: null,
          n: 0,
          pn: 0,
          iv: null,
        });

        const payload = { messageId, isDeleted: true };
        socket.emit('messageDeleted', payload);
        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) io.to(recipientSocketId).emit('messageDeleted', payload);
      } catch (err) {}
    });

    socket.on('reactMessage', async ({ messageId, recipientId, reaction }) => {
      try {
        const msg = await Message.findByPk(messageId);
        if (!msg || msg.isDeleted) return;
        if (msg.senderId !== socket.userId && msg.recipientId !== socket.userId) return;

        const currentReactions = { ...msg.reactions } || {};
        if (!reaction) delete currentReactions[socket.userId];
        else currentReactions[socket.userId] = reaction;

        await msg.update({ reactions: currentReactions });
        const payload = { messageId, reactions: currentReactions };
        socket.emit('messageReacted', payload);
        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) io.to(recipientSocketId).emit('messageReacted', payload);
      } catch (err) {}
    });

    socket.on('markAsRead', async ({ senderId }) => {
      try {
        await Message.update(
          { readAt: new Date() },
          { where: { senderId, recipientId: socket.userId, readAt: null } }
        );
        const senderSocketId = userSockets.get(senderId);
        if (senderSocketId) io.to(senderSocketId).emit('messagesRead', { byUserId: socket.userId });
      } catch (err) {}
    });

    socket.on('typing', ({ recipientId }) => {
      const recipientSocketId = userSockets.get(recipientId);
      if (recipientSocketId) io.to(recipientSocketId).emit('typing', { senderId: socket.userId });
    });

    socket.on('stopTyping', ({ recipientId }) => {
      const recipientSocketId = userSockets.get(recipientId);
      if (recipientSocketId) io.to(recipientSocketId).emit('stopTyping', { senderId: socket.userId });
    });

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

    socket.on('disconnect', async () => {
      userSockets.delete(socket.userId);
      await User.update({ online: false, lastSeenAt: new Date() }, { where: { id: socket.userId } });
      try {
        const contactIds = await getContactIds(socket.userId);
        contactIds.forEach(contactId => {
          io.to(`user:${contactId}`).emit('userStatusChange', { userId: socket.userId, online: false });
        });
      } catch (e) {}
    });
  });
};
