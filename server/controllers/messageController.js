const { Op } = require('sequelize');
const Message = require('../models/Message');

exports.getMessages = async (req, res) => {
  try {
    const { userId } = req.params; // The ID of the user we are chatting with
    const currentUserId = req.userId; // Provided by auth middleware
    const { cursor } = req.query; // Expecting an ISO string date
    const limit = 50;

    const whereClause = {
      [Op.or]: [
        { senderId: currentUserId, recipientId: userId },
        { senderId: userId, recipientId: currentUserId }
      ]
    };

    if (cursor) {
      whereClause.createdAt = {
        [Op.lt]: new Date(cursor)
      };
    }

    // Fetch the latest 50 messages before the cursor
    const messages = await Message.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit
    });

    // Reverse to return them in chronological ascending order
    res.json(messages.reverse());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};
