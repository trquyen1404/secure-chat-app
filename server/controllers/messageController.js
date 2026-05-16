const { Op } = require('sequelize');
const { Message, Block } = require('../models');

exports.getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;
    const { cursor } = req.query;

    // [Security] Block check
    const isBlocked = await Block.findOne({
      where: {
        [Op.or]: [
          { blockerId: currentUserId, blockedId: userId },
          { blockerId: userId, blockedId: currentUserId }
        ]
      }
    });

    if (isBlocked) {
      return res.status(403).json({ error: 'Truy cập bị từ chối (Blocking active)' });
    }

    const limit = 50;
    const whereClause = {
      [Op.or]: [
        { senderId: currentUserId, recipientId: userId },
        { senderId: userId, recipientId: currentUserId }
      ]
    };
    if (cursor) {
      whereClause.createdAt = { [Op.lt]: new Date(cursor) };
    }
    const messages = await Message.findAll({
      where: whereClause,
      attributes: ['id', 'senderId', 'recipientId', 'encryptedContent', 'ratchetKey', 'n', 'pn', 'iv', 'senderEk', 'usedOpk', 'type', 'localId', 'isPinned', 'expiresAt', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit
    });
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

exports.getPendingMessages = async (req, res) => {
  try {
    const currentUserId = req.userId;
    const messages = await Message.findAll({
      where: {
        recipientId: currentUserId,
        deliveredAt: null
      },
      order: [['createdAt', 'ASC']] // Critical for Double Ratchet sequence
    });
    res.json(messages);
  } catch (error) {
    console.error('[messageController] getPendingMessages error:', error);
    res.status(500).json({ error: 'Failed to fetch pending messages' });
  }
};

exports.acknowledgeMessages = async (req, res) => {
  try {
    const { messageIds } = req.body;
    const currentUserId = req.userId;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'Invalid messageIds' });
    }

    await Message.update(
      { deliveredAt: new Date() },
      {
        where: {
          id: { [Op.in]: messageIds },
          recipientId: currentUserId
        }
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[messageController] acknowledgeMessages error:', error);
    res.status(500).json({ error: 'Failed to acknowledge messages' });
  }
};

exports.togglePinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUserId = req.userId;
    const message = await Message.findByPk(messageId);
    
    if (!message) return res.status(404).json({ error: 'Message not found' });
    
    if (message.senderId !== currentUserId && message.recipientId !== currentUserId) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    
    await message.update({ isPinned: !message.isPinned });
    res.json({ id: message.id, isPinned: message.isPinned });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pin message' });
  }
};

exports.getPinnedMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;
    const messages = await Message.findAll({
      where: {
        isPinned: true,
        [Op.or]: [
          { senderId: currentUserId, recipientId: userId },
          { senderId: userId, recipientId: currentUserId }
        ]
      },
      order: [['createdAt', 'DESC']]
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pinned messages' });
  }
};
