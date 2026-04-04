const { Op, Sequelize } = require('sequelize');
const User = require('../models/User');
const PreKey = require('../models/PreKey');
const PinnedChat = require('../models/PinnedChat');
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');

// ── X3DH PreKey Management ──────────────────────────────────────────────────

exports.getPreKeyBundle = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByPk(userId, { attributes: ['id', 'username', 'publicKey', 'dhPublicKey'] });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const signedPreKey = await PreKey.findOne({
      where: { userId, type: 'signed' },
      order: [['createdAt', 'DESC']]
    });

    const otpk = await PreKey.findOne({
      where: { userId, type: 'one-time', isUsed: false },
      order: [Sequelize.fn('RANDOM')]
    });

    // Đánh dấu One-time PreKey đã sử dụng để tránh dùng lại (tăng tính bảo mật X3DH)
    if (otpk) await otpk.update({ isUsed: true });

    res.json({
      identityKey: { sign: user.publicKey, dh: user.dhPublicKey },
      signedPreKey: signedPreKey ? { publicKey: signedPreKey.publicKey, signature: signedPreKey.signature } : null,
      oneTimePreKey: otpk ? { publicKey: otpk.publicKey } : null
    });
  } catch (error) {
    console.error('[getPreKeyBundle]', error);
    res.status(500).json({ error: 'Failed to fetch PreKey bundle' });
  }
};

exports.uploadPreKeys = async (req, res) => {
  try {
    const { signedPreKey, oneTimePreKeys } = req.body;
    if (!signedPreKey || !signedPreKey.publicKey || !signedPreKey.signature) {
      return res.status(400).json({ error: 'Signed PreKey and signature are required' });
    }

    await User.sequelize.transaction(async (t) => {
      // Xóa các khóa cũ của user trước khi cập nhật mới (hoặc giữ lại tùy logic app)
      await PreKey.destroy({ where: { userId: req.userId }, transaction: t });

      await PreKey.create({
        userId: req.userId,
        publicKey: signedPreKey.publicKey,
        signature: signedPreKey.signature,
        type: 'signed'
      }, { transaction: t });

      if (oneTimePreKeys && Array.isArray(oneTimePreKeys)) {
        const opkRecords = oneTimePreKeys.map((k, index) => ({
          userId: req.userId,
          publicKey: k.publicKey,
          type: 'one-time',
          isUsed: false
        }));
        await PreKey.bulkCreate(opkRecords, { transaction: t });
      }
    });

    res.json({ success: true, message: 'PreKeys updated successfully' });
  } catch (error) {
    console.error('[uploadPreKeys error]', error);
    res.status(500).json({ error: 'Failed to update PreKeys' });
  }
};

// ── User Listing & Status ────────────────────────────────────────────────────

async function getContactIds(userId) {
  const rows = await Message.findAll({
    where: { [Op.or]: [{ senderId: userId }, { recipientId: userId }] },
    attributes: ['senderId', 'recipientId'],
    raw: true,
  });
  const ids = new Set();
  rows.forEach(r => {
    if (r.senderId !== userId) ids.add(r.senderId);
    if (r.recipientId !== userId) ids.add(r.recipientId);
  });
  return Array.from(ids);
}

exports.getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { id: { [Op.ne]: req.userId } },
      attributes: ['id', 'username', 'online', 'avatarUrl', 'themeColor', 'lastSeenAt', 'publicKey', 'dhPublicKey']
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: ['online', 'lastSeenAt'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ online: user.online, lastSeenAt: user.lastSeenAt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
};

// ── Profile Management ───────────────────────────────────────────────────────

exports.updateAvatar = async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    await User.update({ avatarUrl }, { where: { id: req.userId } });
    res.json({ success: true, avatarUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update avatar' });
  }
};

exports.updateTheme = async (req, res) => {
  try {
    const { themeColor } = req.body;
    await User.update({ themeColor }, { where: { id: req.userId } });
    res.json({ success: true, themeColor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update theme' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { fullName, bio, phoneNumber, profilePrivacy } = req.body;
    await User.update({ fullName, bio, phoneNumber, profilePrivacy }, { where: { id: req.userId } });

    const updatedUser = await User.findByPk(req.userId, {
      attributes: ['id', 'username', 'avatarUrl', 'fullName', 'bio', 'phoneNumber', 'profilePrivacy']
    });
    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const requesterId = req.userId;

    const user = await User.findByPk(targetUserId, {
      attributes: ['id', 'username', 'avatarUrl', 'themeColor', 'lastSeenAt', 'online', 'fullName', 'bio', 'phoneNumber', 'profilePrivacy']
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const baseProfile = {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      themeColor: user.themeColor,
      lastSeenAt: user.lastSeenAt,
      online: user.online,
      profilePrivacy: user.profilePrivacy
    };

    if (user.id === requesterId || user.profilePrivacy === 'public') {
      return res.json(user);
    }

    if (user.profilePrivacy === 'private') {
      return res.json(baseProfile);
    }

    if (user.profilePrivacy === 'friends') {
      const isFriend = await Friendship.findOne({
        where: {
          status: 'accepted',
          [Op.or]: [
            { requesterId, receiverId: targetUserId },
            { requesterId: targetUserId, receiverId: requesterId }
          ]
        }
      });
      return isFriend ? res.json(user) : res.json(baseProfile);
    }

    res.json(baseProfile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// ── Pinned Chats ─────────────────────────────────────────────────────────────

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