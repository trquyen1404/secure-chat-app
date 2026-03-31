const { Op } = require('sequelize');
const Message = require('../models/Message');

exports.getMessages = async (req, res) => {
  try {
    const { userId } = req.params; // The ID of the user we are chatting with
    const currentUserId = req.userId; // Provided by auth middleware

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, recipientId: userId },
          { senderId: userId, recipientId: currentUserId }
        ]
      },
      order: [['createdAt', 'ASC']]
    });

    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};
