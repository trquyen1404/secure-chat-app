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
      order: [['createdAt', 'DESC']],
      limit
    });
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};
