const jwt = require('jsonwebtoken');
const { User, Message, Block, GroupMessage, GroupMember } = require('../models');
const { Op } = require('sequelize');
const notificationService = require('./notificationService');
const uttBotService = require('./uttBotService');

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

/** Background task to delete expired messages */
async function cleanupExpiredMessages(io) {
  try {
    const now = new Date();
    
    // Find expired group messages to notify clients before deletion
    const expiredGroups = await GroupMessage.findAll({
      where: { expiresAt: { [Op.lte]: now } },
      attributes: ['id', 'groupId']
    });
    
    for (const msg of expiredGroups) {
      io.to(`group:${msg.groupId}`).emit('messageDeleted', { messageId: msg.id, isDeleted: true, reason: 'expired' });
    }
    
    // Find expired individual messages
    const expiredPrivate = await Message.findAll({
      where: { expiresAt: { [Op.lte]: now } },
      attributes: ['id', 'senderId', 'recipientId']
    });
    
    for (const msg of expiredPrivate) {
      const p1 = userSockets.get(msg.senderId);
      const p2 = userSockets.get(msg.recipientId);
      const payload = { messageId: msg.id, isDeleted: true, reason: 'expired' };
      if (p1) io.to(p1).emit('messageDeleted', payload);
      if (p2) io.to(p2).emit('messageDeleted', payload);
    }

    await GroupMessage.destroy({ where: { expiresAt: { [Op.lte]: now } } });
    await Message.destroy({ where: { expiresAt: { [Op.lte]: now } } });
  } catch (err) {
    console.error('[Cleanup] Error:', err);
  }
}

module.exports = (io) => {
  // Start cleanup interval (every 30 seconds)
  setInterval(() => cleanupExpiredMessages(io), 30000);
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
        io.to(`user:${contactId}`).emit('userStatusChange', { userId: socket.userId, online: true, lastSeenAt: new Date() });
      });
    } catch (e) {}

    socket.on('joinGroup', async ({ groupId }) => {
      if (!groupId) return;
      socket.join(`group:${groupId}`);
      console.log(`[SOCKET] User ${socket.userId} joined room group:${groupId}`);
      // Warm up membership cache
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

        // [Security] Verify membership via cache
        const members = await getGroupMembers(groupId);
        if (!members.has(socket.userId)) {
          console.warn(`[SECURITY] User ${socket.userId} attempted to send to group ${groupId} without membership.`);
          return socket.emit('error', { message: 'Not a member of this group' });
        }

        // [Self-Destruct] Calculate expiry: priority to individual message timer, fallback to group setting
        const group = await User.sequelize.models.Group.findByPk(groupId);
        let expiresAt = null;
        const finalExpiry = data.expirySeconds > 0 ? data.expirySeconds : (group?.selfDestructTimer || 0);
        
        if (finalExpiry > 0) {
          expiresAt = new Date(Date.now() + finalExpiry * 1000);
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
          expiresAt,
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
          isPinned: false,
          reactions: {},
          createdAt: message.createdAt,
          expiresAt,
          type: type || 'text'
        };

        // Broadcast to everyone in the group room
        io.to(`group:${groupId}`).emit('newGroupMessage', messageData);

        // Push notification for offline members
        const allMemberIds = Array.from(members);
        const sender = await User.findByPk(socket.userId, { attributes: ['displayName', 'username'] });
        const senderName = sender?.displayName || sender?.username || 'Ai đó';

        for (const memberId of allMemberIds) {
          if (memberId === socket.userId) continue;
          if (!userSockets.has(memberId)) {
            // Offline member
            notificationService.sendNotification(memberId, {
              title: `Nhóm: Tin nhắn mới từ ${senderName}`,
              body: 'Nhấn để mở cuộc trò chuyện',
              data: { groupId, url: `/chat/${groupId}` }
            });
          }
        }
      } catch (error) {
        console.error('[socket] sendGroupMessage error:', error);
      }
    });

    socket.on('sendMessage', async (data) => {
      try {
        const { recipientId, encryptedContent, ratchetKey, n, pn, iv, replyToId, senderEk, usedOpk, localId, type } = data;
        
        console.log(`[RX-Trace] Received packet. n=${n} Handshake=${!!senderEk} Type=${type || 'text'}`);

        // Relax validation: Allow packets without encryptedContent IF they are handshakes (senderEk) or ACKs/Technical
        const isHandshake = !!senderEk;
        const isTechnical = type === 'handshake_ack' || type === 'SENDER_KEY_DISTRIBUTION';
        if (!recipientId || (!encryptedContent && !isHandshake && !isTechnical)) {
           return socket.emit('error', { message: 'Invalid message data (Empty payload rejected)' });
        }

        // [Security] Block List Enforcement
        const isBlocked = await Block.findOne({
          where: { blockerId: recipientId, blockedId: socket.userId }
        });
        if (isBlocked) {
          console.warn(`[BLOCK] Silencing message from ${socket.userId} to ${recipientId} (Blocked)`);
          // We return success to the sender to avoid letting them know they are blocked (Stealth Block)
          return socket.emit('newMessage', { ...data, senderId: socket.userId, createdAt: new Date() });
        }

        // [Self-Destruct] 1-1 expiry can be passed in data
        let expiresAt = null;
        if (data.expirySeconds > 0) {
          expiresAt = new Date(Date.now() + data.expirySeconds * 1000);
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
          expiresAt,
        });

        // --- BOT LOGIC ---
        const recipient = await User.findByPk(recipientId);
        if (recipient && recipient.role === 'bot') {
          // For bots, we assume the content is either plain text (sent specifically to bot)
          // or we simulate the bot's reaction.
          // Since the client knows it's a bot, it will send plain text in encryptedContent.
          const botResponse = uttBotService.getResponse(encryptedContent);
          
          setTimeout(async () => {
             const botMsg = await Message.create({
               senderId: recipientId,
               recipientId: socket.userId,
               encryptedContent: botResponse, // Bot sends plain text
               type: 'text',
               isVerified: true
             });
             
             socket.emit('newMessage', {
               ...botMsg.toJSON(),
               decryptedContent: botResponse
             });
          }, 500);
        }


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
          isPinned: false,
          reactions: {},
          readAt: null,
          createdAt: message.createdAt,
          expiresAt,
          type: type || 'text'
        };

        socket.emit('newMessage', messageData);
        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('newMessage', messageData);
          await message.update({ deliveredAt: new Date() });
        } else {
          // Recipient offline, send push
          const sender = await User.findByPk(socket.userId, { attributes: ['displayName', 'username'] });
          const senderName = sender?.displayName || sender?.username || 'Ai đó';
          notificationService.sendNotification(recipientId, {
            title: `Tin nhắn mới từ ${senderName}`,
            body: 'Bạn có một tin nhắn mới được mã hóa.',
            data: { senderId: socket.userId, url: `/chat/${socket.userId}` }
          });
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

    socket.on('pinMessage', async ({ messageId, recipientId, isPinned }) => {
      try {
        const msg = await Message.findByPk(messageId);
        if (!msg) return;
        if (msg.senderId !== socket.userId && msg.recipientId !== socket.userId) return;

        await msg.update({ isPinned });
        const payload = { messageId, isPinned };
        socket.emit('messagePinned', payload);
        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) io.to(recipientSocketId).emit('messagePinned', payload);
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

    socket.on('deleteGroupMessage', async ({ messageId, groupId }) => {
      try {
        const msg = await GroupMessage.findByPk(messageId);
        if (!msg || msg.groupId !== groupId) return;
        
        // Only sender or potentially group admin (future) can delete
        if (msg.senderId !== socket.userId) return;

        await msg.update({
          isDeleted: true,
          encryptedContent: null,
          ratchetKey: null,
          n: 0,
          pn: 0,
          iv: null,
        });

        io.to(`group:${groupId}`).emit('groupMessageDeleted', { messageId, isDeleted: true });
      } catch (err) {}
    });

    socket.on('pinGroupMessage', async ({ messageId, groupId, isPinned }) => {
      try {
        const msg = await GroupMessage.findByPk(messageId);
        if (!msg || msg.groupId !== groupId) return;

        await msg.update({ isPinned });
        io.to(`group:${groupId}`).emit('groupMessagePinned', { messageId, isPinned });
      } catch (err) {}
    });

    socket.on('reactGroupMessage', async ({ messageId, groupId, reaction }) => {
      try {
        const msg = await GroupMessage.findByPk(messageId);
        if (!msg || msg.groupId !== groupId || msg.isDeleted) return;

        const currentReactions = { ...msg.reactions } || {};
        if (!reaction) delete currentReactions[socket.userId];
        else currentReactions[socket.userId] = reaction;

        await msg.update({ reactions: currentReactions });
        io.to(`group:${groupId}`).emit('groupMessageReacted', { messageId, reactions: currentReactions });
      } catch (err) {}
    });

    socket.on('markAsRead', async ({ senderId, groupId }) => {
      try {
        if (groupId) {
          // Group Read Status: Update GroupMember's lastReadMessageId to the latest message in group
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
            // Optionally broadcast read event so recipients know you read it
            socket.to(`group:${groupId}`).emit('groupMessageRead', { groupId, byUserId: socket.userId, messageId: lastMsg.id });
          }
        } else if (senderId) {
          // 1-1 Read Status
          await Message.update(
            { readAt: new Date() },
            { where: { senderId, recipientId: socket.userId, readAt: null } }
          );
          const senderSocketId = userSockets.get(senderId);
          if (senderSocketId) io.to(senderSocketId).emit('messagesRead', { byUserId: socket.userId });
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
          io.to(`user:${contactId}`).emit('userStatusChange', { userId: socket.userId, online: false, lastSeenAt: new Date() });
        });
      } catch (e) {}
    });
  });
};
