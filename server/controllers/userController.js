const { Op, Sequelize } = require('sequelize');
const { User, PreKey, Block } = require('../models');

exports.getPreKeyBundle = async (req, res) => {
  try {
    const { userId } = req.params;

    // [Security] Block check - Prevent key bundle retrieval if blocking is active
    const isBlocked = await Block.findOne({
      where: {
        [Op.or]: [
          { blockerId: req.userId, blockedId: userId },
          { blockerId: userId, blockedId: req.userId }
        ]
      }
    });

    if (isBlocked) {
      return res.status(403).json({ error: 'Truy cập bị từ chối (Blocking active)' });
    }

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
    // [Security] Fetch users who have NOT blocked us and whom we have NOT blocked
    const blocks = await Block.findAll({
      where: { [Op.or]: [{ blockerId: req.userId }, { blockedId: req.userId }] },
      raw: true
    });
    const blockedIds = blocks.map(b => b.blockerId === req.userId ? b.blockedId : b.blockerId);

    const users = await User.findAll({
      where: { 
        id: { 
          [Op.and]: [
            { [Op.ne]: req.userId },
            { [Op.notIn]: blockedIds }
          ]
        } 
      },
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

exports.uploadVault = async (req, res) => {
  try {
    const { vaultData } = req.body;
    if (!vaultData) return res.status(400).json({ error: 'Vault data is required' });
    
    await User.update({ vaultData }, { where: { id: req.userId } });
    console.log(`[VAULT] User ${req.userId} uploaded specialized vault data (size: ${vaultData.length})`);
    res.json({ success: true });
  } catch (error) {
    console.error('[VAULT Upload Error]', error);
    res.status(500).json({ error: 'Failed to upload vault data' });
  }
};

exports.downloadVault = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, { attributes: ['vaultData'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    console.log(`[VAULT] User ${req.userId} downloaded vault data (size: ${user.vaultData?.length || 0})`);
    res.json({ vaultData: user.vaultData || null });
  } catch (error) {
    console.error('[VAULT Download Error]', error);
    res.status(500).json({ error: 'Failed to download vault data' });
  }
};

// ── Block List Logic ──────────────────

exports.blockUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID to block is required' });
    if (userId === req.userId) return res.status(400).json({ error: 'You cannot block yourself' });

    await Block.findOrCreate({
      where: { blockerId: req.userId, blockedId: userId }
    });

    res.json({ success: true, message: 'User blocked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to block user' });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const { userId } = req.body;
    await Block.destroy({
      where: { blockerId: req.userId, blockedId: userId }
    });
    res.json({ success: true, message: 'User unblocked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unblock user' });
  }
};

exports.getBlockedUsers = async (req, res) => {
  try {
    const blocks = await Block.findAll({
      where: { blockerId: req.userId },
      include: [{ model: User, as: 'BlockedUser', attributes: ['id', 'username', 'avatarUrl'] }]
    });
    res.json(blocks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, { 
      attributes: [
        'id', 'username', 'avatarUrl', 'themeColor', 
        'online', 'lastSeenAt', 'publicKey', 'dhPublicKey',
        'encryptedPrivateKey', 'keyBackupSalt', 'keyBackupIv'
      ] 
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('[PROFILE Error]', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};
