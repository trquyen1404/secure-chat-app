const { User, Friend } = require('../models');
const { Op } = require('sequelize');

exports.sendRequest = async (req, res) => {
  try {
    const { recipientId } = req.body;
    const requesterId = req.user.id;

    if (requesterId === recipientId) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }

    const existing = await Friend.findOne({
      where: {
        [Op.or]: [
          { requesterId, recipientId },
          { requesterId: recipientId, recipientId: requesterId }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Friend request already exists or you are already friends' });
    }

    const friendReq = await Friend.create({ requesterId, recipientId, status: 'pending' });
    res.status(201).json(friendReq);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send friend request' });
  }
};

exports.acceptRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user.id;

    const friendReq = await Friend.findOne({ where: { id: requestId, recipientId: userId, status: 'pending' } });
    if (!friendReq) return res.status(404).json({ error: 'Request not found' });

    friendReq.status = 'accepted';
    await friendReq.save();
    res.json(friendReq);
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept' });
  }
};

exports.getFriends = async (req, res) => {
  try {
    const userId = req.user.id;
    const friendships = await Friend.findAll({
      where: {
        [Op.or]: [{ requesterId: userId }, { recipientId: userId }],
        status: 'accepted'
      },
      include: [
        { model: User, as: 'Requester', attributes: ['id', 'username', 'displayName', 'avatarUrl', 'online'] },
        { model: User, as: 'Recipient', attributes: ['id', 'username', 'displayName', 'avatarUrl', 'online'] }
      ]
    });

    const friends = friendships.map(f => {
      return f.requesterId === userId ? f.Recipient : f.Requester;
    });

    res.json(friends);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
};

exports.getRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const requests = await Friend.findAll({
      where: { recipientId: userId, status: 'pending' },
      include: [{ model: User, as: 'Requester', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }]
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
};
