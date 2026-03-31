const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');

const userSockets = new Map(); // Map userId to Socket ID

module.exports = (io) => {
  // Authentication middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    userSockets.set(socket.userId, socket.id);

    // Broadcast user is online
    await User.update({ online: true }, { where: { id: socket.userId } });
    io.emit('userStatusChange', { userId: socket.userId, online: true });

    socket.on('sendMessage', async (data) => {
      try {
        const { recipientId, encryptedContent, encryptedAesKeyForSender, encryptedAesKeyForRecipient, iv, replyToId } = data;

        // Save to database
        const message = await Message.create({
          senderId: socket.userId,
          recipientId: recipientId, 
          encryptedContent,
          encryptedAesKeyForSender,
          encryptedAesKeyForRecipient,
          iv,
          replyToId: replyToId || null
        });

        const messageData = {
          id: message.id, 
          senderId: socket.userId,
          recipientId: recipientId,
          encryptedContent,
          encryptedAesKeyForSender,
          encryptedAesKeyForRecipient,
          iv,
          replyToId: replyToId || null,
          isDeleted: false,
          reactions: {},
          readAt: null,
          createdAt: message.createdAt
        };

        // Bounce back to sender for their UI history
        socket.emit('newMessage', messageData);

        // Deliver to recipient if they are online
        const recipientSocketId = userSockets.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('newMessage', messageData);
        }
      } catch (error) {
        console.error('Socket sendMessage error:', error);
      }
    });

    // --- PHASE 4 MESSENGER CORE EVENTS ---
    socket.on('deleteMessage', async ({ messageId, recipientId }) => {
      try {
         const msg = await Message.findByPk(messageId);
         if (!msg || msg.senderId !== socket.userId) return;

         await msg.update({
            isDeleted: true,
            encryptedContent: null,
            encryptedAesKeyForSender: null,
            encryptedAesKeyForRecipient: null,
            iv: null
         });

         const payload = { messageId, isDeleted: true };
         socket.emit('messageDeleted', payload);

         const recipientSocketId = userSockets.get(recipientId);
         if (recipientSocketId) {
            io.to(recipientSocketId).emit('messageDeleted', payload);
         }
      } catch (err) {
         console.error(err);
      }
    });

    socket.on('reactMessage', async ({ messageId, recipientId, reaction }) => {
       try {
         const msg = await Message.findByPk(messageId);
         if (!msg || msg.isDeleted) return;

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
         console.error(err);
       }
    });

    socket.on('markAsRead', async ({ senderId }) => {
        try {
           await Message.update(
              { readAt: new Date() },
              { where: { senderId: senderId, recipientId: socket.userId, readAt: null } }
           );
           const senderSocketId = userSockets.get(senderId);
           if (senderSocketId) {
              io.to(senderSocketId).emit('messagesRead', { byUserId: socket.userId });
           }
        } catch (err) {
           console.error(err);
        }
    });

    socket.on('typing', ({ recipientId }) => {
      const recipientSocketId = userSockets.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('typing', { senderId: socket.userId });
      }
    });

    socket.on('stopTyping', ({ recipientId }) => {
      const recipientSocketId = userSockets.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('stopTyping', { senderId: socket.userId });
      }
    });

    // --- WebRTC Signaling ---
    socket.on('callUser', (data) => {
      const toSocket = userSockets.get(data.userToCall);
      if (toSocket) {
        io.to(toSocket).emit('incomingCall', {
          signal: data.signal,
          from: socket.userId,
          isVideo: data.isVideo
        });
      }
    });

    socket.on('answerCall', (data) => {
      const toSocket = userSockets.get(data.to);
      if (toSocket) {
        io.to(toSocket).emit('callAccepted', data.signal);
      }
    });

    socket.on('iceCandidate', (data) => {
      const toSocket = userSockets.get(data.to);
      if (toSocket) {
        io.to(toSocket).emit('iceCandidate', data.candidate);
      }
    });

    socket.on('endCall', (data) => {
      const toSocket = userSockets.get(data.to);
      if (toSocket) {
        io.to(toSocket).emit('callEnded');
      }
    });

    socket.on('rejectCall', (data) => {
      const toSocket = userSockets.get(data.to);
      if (toSocket) {
        io.to(toSocket).emit('callRejected');
      }
    });

    socket.on('disconnect', async () => {
      userSockets.delete(socket.userId);
      await User.update({ online: false }, { where: { id: socket.userId } });
      io.emit('userStatusChange', { userId: socket.userId, online: false });
    });
  });
};
