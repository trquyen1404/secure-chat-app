const { Op } = require('sequelize');
const Friendship = require('../models/Friendship');
const User = require('../models/User');

// Send friend request
exports.sendRequest = async (req, res) => {
  try {
    const { receiverId } = req.body;
    const requesterId = req.userId;

    if (requesterId === receiverId) {
      return res.status(400).json({ error: 'Cannot send request to yourself' });
    }

    // Check if receiver exists
    const receiver = await User.findByPk(receiverId);
    if (!receiver) return res.status(404).json({ error: 'User not found' });

    // Check if request already exists
    const existingReq = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId, receiverId },
          { requesterId: receiverId, receiverId: requesterId }
        ]
      }
    });

    if (existingReq) {
      if (existingReq.status === 'accepted') {
        return res.status(400).json({ error: 'Already friends' });
      }
      return res.status(400).json({ error: 'Friend request already pending' });
    }

    const newReq = await Friendship.create({
      requesterId,
      receiverId,
      status: 'pending'
    });

    res.status(201).json({ success: true, request: newReq });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send request' });
  }
};

// Accept friend request
exports.acceptRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.userId;

    const request = await Friendship.findByPk(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (request.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to accept this request' });
    }

    if (request.status === 'accepted') {
      return res.status(400).json({ error: 'Already accepted' });
    }

    request.status = 'accepted';
    await request.save();

    res.json({ success: true, message: 'Request accepted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to accept request' });
  }
};

// Get friends and pending requests
exports.getFriends = async (req, res) => {
  try {
    const userId = req.userId;

    const friendships = await Friendship.findAll({
      where: {
        [Op.or]: [
          { requesterId: userId },
          { receiverId: userId }
        ]
      },
      include: [
        { model: User, as: 'Requester', attributes: ['id', 'username', 'avatarUrl'] },
        { model: User, as: 'Receiver', attributes: ['id', 'username', 'avatarUrl'] }
      ]
    });

    const requests = [];
    const friends = [];

    friendships.forEach(f => {
      if (f.status === 'accepted') {
        // Find the other user
        const friend = f.requesterId === userId ? f.Receiver : f.Requester;
        friends.push(friend);
      } else {
        requests.push({
          id: f.id,
          direction: f.requesterId === userId ? 'sent' : 'received',
          user: f.requesterId === userId ? f.Receiver : f.Requester
        });
      }
    });

    res.json({ friends, requests });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
};
