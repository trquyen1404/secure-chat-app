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
      attributes: ['id', 'senderId', 'recipientId', 'encryptedContent', 'ratchetKey', 'n', 'pn', 'iv', 'senderEk', 'usedOpk', 'type', 'localId', 'createdAt'],
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
