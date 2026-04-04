const { Op } = require('sequelize');
const User = require('../models/User');

// Get list of users (excluding self)
exports.getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { id: { [Op.ne]: req.userId } },
      attributes: ['id', 'username', 'online', 'avatarUrl', 'themeColor', 'lastSeenAt', 'publicKey']
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Update avatar (expects { avatarUrl } in body; can be a data URL)
exports.updateAvatar = async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    await User.update({ avatarUrl }, { where: { id: req.userId } });
    res.json({ success: true, avatarUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update avatar' });
  }
};

// Update theme colour
exports.updateTheme = async (req, res) => {
  try {
    const { themeColor } = req.body;
    await User.update({ themeColor }, { where: { id: req.userId } });
    res.json({ success: true, themeColor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update theme' });
  }
};

// Get status (lastSeen & online) for a given user id
exports.getStatus = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: ['online', 'lastSeenAt'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ online: user.online, lastSeenAt: user.lastSeenAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to get status' });
  }
};

// Update entire profile
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, bio, phoneNumber, profilePrivacy } = req.body;
    await User.update({ fullName, bio, phoneNumber, profilePrivacy }, { where: { id: req.userId } });
    
    // fetch updated user
    const updatedUser = await User.findByPk(req.userId, {
      attributes: ['id', 'username', 'avatarUrl', 'fullName', 'bio', 'phoneNumber', 'profilePrivacy']
    });
    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Get profile
exports.getProfile = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const requesterId = req.userId;

    const user = await User.findByPk(targetUserId, {
      attributes: ['id', 'username', 'avatarUrl', 'themeColor', 'lastSeenAt', 'online', 'fullName', 'bio', 'phoneNumber', 'profilePrivacy']
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Base profile everyone can see
    const baseProfile = {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      themeColor: user.themeColor,
      lastSeenAt: user.lastSeenAt,
      online: user.online,
      profilePrivacy: user.profilePrivacy
    };

    if (user.id === requesterId) {
      // Self
      return res.json(user);
    }

    if (user.profilePrivacy === 'public') {
      return res.json(user);
    }

    if (user.profilePrivacy === 'private') {
      return res.json(baseProfile);
    }

    if (user.profilePrivacy === 'friends') {
      // check if friends using Friendship model
      const { Op } = require('sequelize');
      const Friendship = require('../models/Friendship');
      const isFriend = await Friendship.findOne({
        where: {
          [Op.or]: [
            { requesterId, receiverId: targetUserId, status: 'accepted' },
            { requesterId: targetUserId, receiverId: requesterId, status: 'accepted' }
          ]
        }
      });
      if (isFriend) {
        return res.json(user);
      } else {
        return res.json(baseProfile);
      }
    }

    res.json(baseProfile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// ── Pinned Chats ──
const PinnedChat = require('../models/PinnedChat');

exports.getPins = async (req, res) => {
  try {
    const pins = await PinnedChat.findAll({ where: { userId: req.userId } });
    res.json(pins);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch pins' });
  }
};

exports.pinChat = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    await PinnedChat.findOrCreate({
      where: { userId: req.userId, targetUserId }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to pin chat' });
  }
};

exports.unpinChat = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    await PinnedChat.destroy({
      where: { userId: req.userId, targetUserId }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to unpin chat' });
  }
};
