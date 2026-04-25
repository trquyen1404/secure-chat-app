const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const webpush = require('web-push');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET;
const userSockets = new Map();

// Cấu hình Web Push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@securechat.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

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
  // Middleware xác thực JWT cho Socket
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
    const roomName = `user:${socket.userId}`;
    socket.join(roomName);
    console.log(`[Socket] User ${socket.userId} connected (Socket ID: ${socket.id}) and joined room ${roomName}`);

    // Log all rooms for this socket to verify
    // console.log(`[Socket] Rooms for ${socket.id}:`, Array.from(socket.rooms));

    // Cập nhật trạng thái Online
    await User.update({ online: true }, { where: { id: socket.userId } });
    try {
      const contactIds = await getContactIds(socket.userId);
      contactIds.forEach(contactId => {
        io.to(`user:${contactId}`).emit('userStatusChange', { userId: socket.userId, online: true });
      });
    } catch (e) { }

    // 1. Xử lý gửi tin nhắn (E2EE - Double Ratchet)
    socket.on('sendMessage', async (data) => {
      try {
        const { recipientId, encryptedContent, ratchetKey, n, pn, iv, replyToId, senderEk, usedOpk, localId, expiresInSeconds } = data;

        if (!recipientId || !encryptedContent || !iv) {
          return socket.emit('error', { message: 'Dữ liệu tin nhắn không hợp lệ' });
        }

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
          expiresInSeconds: expiresInSeconds || null,
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
          expiresInSeconds: expiresInSeconds || null,
          isDeleted: false,
          reactions: {},
          readAt: null,
          createdAt: message.createdAt,
        };

        // Gửi cho người gửi (tất cả các tab) và người nhận (tất cả các tab)
        console.log(`[Socket] Broadcasting newMessage to user:${socket.userId} and user:${recipientId}`);
        io.to(`user:${socket.userId}`).emit('newMessage', messageData);
        io.to(`user:${recipientId}`).emit('newMessage', messageData);

        // Gửi Push Notification nếu người nhận offline
        const recipientActive = userSockets.has(recipientId);
        if (!recipientActive) {
          try {
            const recipient = await User.findByPk(recipientId);
            if (recipient && recipient.webPushSubscription) {
              const payload = JSON.stringify({
                title: 'Tin nhắn mới bảo mật',
                body: 'Bạn có một tin nhắn mới đang chờ giải mã.',
                url: '/'
              });
              await webpush.sendNotification(recipient.webPushSubscription, payload);
            }
          } catch (pushErr) {
            console.error('[web-push] Error:', pushErr);
          }
        }
      } catch (error) {
        console.error('[socket] sendMessage error:', error);
      }
    });

    // 2. Thu hồi tin nhắn
    socket.on('deleteMessage', async ({ messageId, recipientId }) => {
      try {
        const msg = await Message.findByPk(messageId);
        if (!msg || msg.senderId !== socket.userId) return;

        await msg.update({
          isDeleted: true,
          encryptedContent: null,
          ratchetKey: null,
          iv: null,
        });

        const payload = { messageId, isDeleted: true };
        io.to(`user:${socket.userId}`).emit('messageDeleted', payload);
        io.to(`user:${recipientId}`).emit('messageDeleted', payload);
      } catch (err) { }
    });

    // 3. Thả cảm xúc
    socket.on('reactMessage', async ({ messageId, recipientId, reaction }) => {
      try {
        const msg = await Message.findByPk(messageId);
        if (!msg || msg.isDeleted) return;

        const currentReactions = { ...msg.reactions } || {};
        if (!reaction) delete currentReactions[socket.userId];
        else currentReactions[socket.userId] = reaction;

        await msg.update({ reactions: currentReactions });
        const payload = { messageId, reactions: currentReactions };
        io.to(`user:${socket.userId}`).emit('messageReacted', payload);
        io.to(`user:${recipientId}`).emit('messageReacted', payload);
      } catch (err) { }
    });

    // 4. Đã xem & Tin nhắn tự hủy
    socket.on('markAsRead', async ({ senderId }) => {
      try {
        const now = new Date();
        await Message.update(
          { readAt: now },
          { where: { senderId, recipientId: socket.userId, readAt: null } }
        );

        const senderSocketId = userSockets.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messagesRead', { byUserId: socket.userId });
        }

        // Xử lý tự hủy (Self-destruction)
        const messagesToBurn = await Message.findAll({
          where: {
            senderId,
            recipientId: socket.userId,
            expiresInSeconds: { [Op.not]: null },
            isDeleted: false
          }
        });

        messagesToBurn.forEach(msg => {
          setTimeout(async () => {
            await msg.update({
              isDeleted: true,
              encryptedContent: null,
              iv: null,
            });
            const payload = { messageId: msg.id, isDeleted: true };
            io.to(`user:${socket.userId}`).emit('messageDeleted', payload);
            io.to(`user:${senderId}`).emit('messageDeleted', payload);
          }, msg.expiresInSeconds * 1000);
        });

      } catch (err) {
        console.error('[socket] markAsRead error:', err);
      }
    });

    // 5. Typing states
    socket.on('typing', ({ recipientId }) => {
      const recipientSocketId = userSockets.get(recipientId);
      if (recipientSocketId) io.to(recipientSocketId).emit('typing', { senderId: socket.userId });
    });

    socket.on('stopTyping', ({ recipientId }) => {
      const recipientSocketId = userSockets.get(recipientId);
      if (recipientSocketId) io.to(recipientSocketId).emit('stopTyping', { senderId: socket.userId });
    });

    // 6. WebRTC (Calls)
    socket.on('callUser', (data) => {
      const toSocket = userSockets.get(data.userToCall);
      if (toSocket) io.to(toSocket).emit('incomingCall', { signal: data.signal, from: socket.userId, isVideo: data.isVideo });
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

    // 7. Disconnect
    socket.on('disconnect', async () => {
      userSockets.delete(socket.userId);
      await User.update({ online: false, lastSeenAt: new Date() }, { where: { id: socket.userId } });
      try {
        const contactIds = await getContactIds(socket.userId);
        contactIds.forEach(contactId => {
          io.to(`user:${contactId}`).emit('userStatusChange', { userId: socket.userId, online: false });
        });
      } catch (e) { }
    });
  });
};