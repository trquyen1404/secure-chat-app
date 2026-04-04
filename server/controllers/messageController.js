const { Op } = require('sequelize');
const Message = require('../models/Message');

exports.getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;
    const { cursor } = req.query;
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
