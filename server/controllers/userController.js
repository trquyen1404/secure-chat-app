const { Op, Sequelize } = require('sequelize');
const { User, Message, PreKey, Block, Friendship } = require('../models');
const multer = require('multer');
const path = require('path');

// Configure Multer for Avatar Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/avatars');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'user-' + req.userId + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Chỉ chấp nhận định dạng ảnh (jpeg, jpg, png, webp)'));
  }
}).single('avatar');

exports.uploadAvatarMiddleware = upload;

// ── X3DH PreKey Management ──────────────────────────────────────────────────

exports.getPreKeyBundle = async (req, res) => {
  try {
    const { userId } = req.params;

    // [Security] Block check
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

exports.updatePreKeys = async (req, res) => {
  try {
    const { signedPreKey, oneTimePreKeys } = req.body;
    if (!signedPreKey || !signedPreKey.publicKey || !signedPreKey.signature) {
      return res.status(400).json({ error: 'Signed PreKey and signature are required' });
    }

    await User.sequelize.transaction(async (t) => {
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
    console.error('[updatePreKeys error]', error);
    res.status(500).json({ error: 'Failed to update PreKeys' });
  }
};

exports.uploadOpks = async (req, res) => {
  try {
    const { oneTimePreKeys } = req.body;
    if (!oneTimePreKeys || !Array.isArray(oneTimePreKeys)) {
      return res.status(400).json({ error: 'oneTimePreKeys array is required' });
    }
    
    await User.sequelize.transaction(async (t) => {
      await PreKey.destroy({ where: { userId: req.userId, type: 'one-time' }, transaction: t });
      const opkRecords = oneTimePreKeys.map((k, index) => ({
        userId: req.userId,
        publicKey: k.publicKey,
        type: 'one-time'
      }));
      await PreKey.bulkCreate(opkRecords, { transaction: t });
    });
    
    res.json({ success: true, message: 'OPKs updated successfully' });
  } catch (error) {
    console.error('[uploadOpks error]', error);
    res.status(500).json({ error: 'Failed to update OPKs' });
  }
};

exports.clearPreKeys = async (req, res) => {
  try {
    await PreKey.destroy({ where: { userId: req.userId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear PreKeys' });
  }
};

// ── User Listing & Status ────────────────────────────────────────────────────

exports.getUsers = async (req, res) => {
  try {
    const currentUserId = req.userId;
    const blocks = await Block.findAll({
      where: { [Op.or]: [{ blockerId: currentUserId }, { blockedId: currentUserId }] },
      raw: true
    });
    const blockedIds = blocks.map(b => b.blockerId === currentUserId ? b.blockedId : b.blockerId);

    const users = await User.findAll({
      where: { 
        id: { 
          [Op.and]: [
            { [Op.ne]: currentUserId },
            { [Op.notIn]: blockedIds }
          ]
        } 
      },
      attributes: ['id', 'username', 'displayName', 'online', 'avatarUrl', 'themeColor', 'lastSeenAt', 'publicKey', 'dhPublicKey']
    });

    const usersWithLatestMsg = await Promise.all(users.map(async (u) => {
      const latestMessage = await Message.findOne({
        where: {
          [Op.or]: [
            { senderId: currentUserId, recipientId: u.id },
            { senderId: u.id, recipientId: currentUserId }
          ],
          type: { [Op.notIn]: ['handshake_ack', 'SENDER_KEY_DISTRIBUTION', 'SESSION_DESYNC_ERROR'] }
        },
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'senderId', 'recipientId', 'encryptedContent', 'readAt', 'createdAt', 'type']
      });

      return {
        ...u.get({ plain: true }),
        latestMessage: latestMessage || null
      };
    }));

    res.json(usersWithLatestMsg);
  } catch (error) {
    console.error('[getUsers]', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.json([]);
    const users = await User.findAll({
      where: {
        username: { [Op.iLike]: `%${query}%` },
        id: { [Op.ne]: req.userId }
      },
      attributes: ['id', 'username', 'displayName', 'avatarUrl']
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search users' });
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

exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: [
        'id', 'username', 'displayName', 'fullName', 'bio', 'phoneNumber', 'avatarUrl', 'themeColor', 
        'online', 'lastSeenAt', 'publicKey', 'dhPublicKey', 'profilePrivacy',
        'encryptedPrivateKey', 'keyBackupSalt', 'keyBackupIv', 'vaultVersion'
      ]
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch me' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const targetUserId = req.params.id || req.params.userId;
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
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { displayName, fullName, bio, phoneNumber, profilePrivacy, themeColor } = req.body;
    const updateData = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (fullName !== undefined) updateData.fullName = fullName;
    if (bio !== undefined) updateData.bio = bio;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (profilePrivacy !== undefined) updateData.profilePrivacy = profilePrivacy;
    if (themeColor !== undefined) updateData.themeColor = themeColor;

    await User.update(updateData, { where: { id: req.userId } });
    const updatedUser = await User.findByPk(req.userId);
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không tìm thấy file ảnh' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await User.update({ avatarUrl }, { where: { id: req.userId } });
    res.json({ success: true, avatarUrl });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi tải ảnh lên' });
  }
};

exports.updatePushSubscription = async (req, res) => {
  try {
    const subscription = req.body;
    await User.update({ webPushSubscription: subscription }, { where: { id: req.userId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update push subscription' });
  }
};

// ── Vault Management ─────────────────────────────────────────────────────────

exports.uploadVault = async (req, res) => {
  try {
    const { vaultData } = req.body;
    if (!vaultData) return res.status(400).json({ error: 'Vault data is required' });
    
    const user = await User.findByPk(req.userId);
    const newVersion = (user.vaultVersion || 0) + 1;
    
    await user.update({ vaultData, vaultVersion: newVersion });
    res.json({ success: true, vaultVersion: newVersion });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload vault data' });
  }
};

exports.downloadVault = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, { attributes: ['vaultData'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ vaultData: user.vaultData || null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to download vault data' });
  }
};

// ── Block List Logic ──────────────────

exports.blockUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID to block is required' });
    if (userId === req.userId) return res.status(400).json({ error: 'You cannot block yourself' });

    await Block.findOrCreate({ where: { blockerId: req.userId, blockedId: userId } });
    res.json({ success: true, message: 'User blocked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to block user' });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const { userId } = req.body;
    await Block.destroy({ where: { blockerId: req.userId, blockedId: userId } });
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

// ── Pinned Chats (Legacy Support) ──────────────────
// Note: Requires PinnedChat model to be in db
exports.getPins = async (req, res) => {
  try {
    const { PinnedChat } = require('../models');
    if (!PinnedChat) return res.json([]);
    const pins = await PinnedChat.findAll({ where: { userId: req.userId } });
    res.json(pins);
  } catch (error) {
    res.json([]);
  }
};
