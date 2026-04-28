const jwt = require('jsonwebtoken');
const { User, Message, Block, GroupMessage, GroupMember } = require('../models');
const webpush = require('web-push');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET;
const userSockets = new Map();
const membershipCache = new Map(); // groupId -> Set(userIds)

async function getGroupMembers(groupId) {
  if (membershipCache.has(groupId)) return membershipCache.get(groupId);
  const members = await GroupMember.findAll({ where: { groupId }, attributes: ['userId'] });
  const ids = new Set(members.map(m => m.userId));
  membershipCache.set(groupId, ids);
  return ids;
}

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
    socket.join(`user:${socket.userId}`);

    // Cập nhật trạng thái Online
    await User.update({ online: true }, { where: { id: socket.userId } });
    try {
      const contactIds = await getContactIds(socket.userId);
      contactIds.forEach(contactId => {
        io.to(`user:${contactId}`).emit('userStatusChange', { userId: socket.userId, online: true });
      });
    } catch (e) { }

    socket.on('joinGroup', async ({ groupId }) => {
      if (!groupId) return;
      socket.join(`group:${groupId}`);
      console.log(`[SOCKET] User ${socket.userId} joined room group:${groupId}`);
      try {
        await getGroupMembers(groupId);
      } catch (e) {
        console.error('[SOCKET] Cache warmup failed:', e);
      }
    });

    socket.on('leaveGroup', ({ groupId }) => {
      if (!groupId) return;
      socket.leave(`group:${groupId}`);
      console.log(`[SOCKET] User ${socket.userId} left room group:${groupId}`);
    });

    socket.on('sendGroupMessage', async (data) => {
      try {
        const { groupId, encryptedContent, ratchetKey, n, pn, iv, replyToId, localId, type, signature, index } = data;
        
        if (!groupId || (!encryptedContent && type !== 'SENDER_KEY_DISTRIBUTION')) {
           return socket.emit('error', { message: 'Invalid group message data' });
        }

        const members = await getGroupMembers(groupId);
        if (!members.has(socket.userId)) {
          console.warn(`[SECURITY] User ${socket.userId} attempted to send to group ${groupId} without membership.`);
          return socket.emit('error', { message: 'Not a member of this group' });
        }

        const message = await GroupMessage.create({
          groupId,
          senderId: socket.userId,
          encryptedContent,
          ratchetKey: ratchetKey || null,
          n: (index !== undefined ? index : n) || 0,
          pn: pn || 0,
          iv: iv || null,
          replyToId: replyToId || null,
          type: type || 'text',
          signature: signature || null,
          localId: localId || null,
        });

        const messageData = {
          id: message.id,
          localId: localId || null,
          groupId,
          senderId: socket.userId,
          encryptedContent,
          ratchetKey,
          n: message.n,
          index: message.n,
          pn,
          iv,
          signature: signature || null,
          replyToId: replyToId || null,
          isDeleted: false,
          reactions: {},
          createdAt: message.createdAt,
          type: type || 'text'
        };

        io.to(`group:${groupId}`).emit('newGroupMessage', messageData);
      } catch (error) {
        console.error('[socket] sendGroupMessage error:', error);
      }
    });

    socket.on('sendMessage', async (data) => {
      try {
        const { recipientId, encryptedContent, ratchetKey, n, pn, iv, replyToId, senderEk, usedOpk, localId, type, expiresInSeconds } = data;
        
        const isHandshake = !!senderEk;
        const isTechnical = type === 'handshake_ack' || type === 'SENDER_KEY_DISTRIBUTION';
        if (!recipientId || (!encryptedContent && !isHandshake && !isTechnical)) {
           return socket.emit('error', { message: 'Invalid message data (Empty payload rejected)' });
        }

        const isBlocked = await Block.findOne({
          where: { blockerId: recipientId, blockedId: socket.userId }
        });
        if (isBlocked) {
          return socket.emit('newMessage', { ...data, senderId: socket.userId, createdAt: new Date() });
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
          type: type || 'text',
          localId: localId || null,
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
          type: type || 'text'
        };

        socket.emit('newMessage', messageData);
        const recipientSocketId = userSockets.get(recipientId);

        if (recipientSocketId) {
          io.to(recipientSocketId).emit('newMessage', messageData);
          await message.update({ deliveredAt: new Date() });
        } else {
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

    socket.on('handshake_ack', async (data) => {
      try {
        const { recipientId } = data;
        if (!recipientId) return;
        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('handshake_ack', {
            ...data,
            senderId: socket.userId,
            type: 'handshake_ack'
          });
        }
      } catch (error) {
        console.error('[socket] handshake_ack error:', error);
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
          iv: null,
        });

        const payload = { messageId, isDeleted: true };
        io.to(`user:${socket.userId}`).emit('messageDeleted', payload);
        io.to(`user:${recipientId}`).emit('messageDeleted', payload);
      } catch (err) { }
    });

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

    socket.on('markAsRead', async ({ senderId, groupId }) => {
      try {
        if (groupId) {
          const lastMsg = await GroupMessage.findOne({
            where: { groupId },
            order: [['createdAt', 'DESC']],
            attributes: ['id']
          });
          if (lastMsg) {
            await GroupMember.update(
              { lastReadMessageId: lastMsg.id },
              { where: { groupId, userId: socket.userId } }
            );
            socket.to(`group:${groupId}`).emit('groupMessageRead', { groupId, byUserId: socket.userId, messageId: lastMsg.id });
          }
        } else if (senderId) {
          const now = new Date();
          await Message.update(
            { readAt: now },
            { where: { senderId, recipientId: socket.userId, readAt: null } }
          );
          const senderSocketId = userSockets.get(senderId);
          if (senderSocketId) io.to(senderSocketId).emit('messagesRead', { byUserId: socket.userId });

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
        }
      } catch (err) {
        console.error('[socket] markAsRead error:', err);
      }
    });

    socket.on('groupTyping', async ({ groupId }) => {
      if (!groupId) return;
      try {
        const members = await getGroupMembers(groupId);
        if (members.has(socket.userId)) {
          socket.to(`group:${groupId}`).emit('groupTyping', { groupId, senderId: socket.userId });
        }
      } catch (e) {}
    });

    socket.on('groupStopTyping', ({ groupId }) => {
      if (!groupId) return;
      socket.to(`group:${groupId}`).emit('groupStopTyping', { groupId, senderId: socket.userId });
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