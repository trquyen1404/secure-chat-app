const { Op, Sequelize } = require('sequelize');
const { User, Message, PreKey, Block } = require('../models');
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

exports.getUsers = async (req, res) => {
  try {
    const currentUserId = req.userId;
    // [Security] Fetch users who have NOT blocked us and whom we have NOT blocked
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

    // Attach latest message for each user
    const usersWithLatestMsg = await Promise.all(users.map(async (u) => {
      const latestMessage = await Message.findOne({
        where: {
          [Op.or]: [
            { senderId: currentUserId, recipientId: u.id },
            { senderId: u.id, recipientId: currentUserId }
          ],
          [Op.and]: [
            { type: { [Op.notIn]: ['handshake_ack', 'SENDER_KEY_DISTRIBUTION', 'SESSION_DESYNC_ERROR'] } },
            {
              [Op.or]: [
                { senderEk: null },
                { encryptedContent: { [Op.ne]: null } }
              ]
            }
          ]
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

exports.updateAvatar = async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    await User.update({ avatarUrl }, { where: { id: req.userId } });
    res.json({ success: true, avatarUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update avatar' });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không tìm thấy file ảnh' });
    
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await User.update({ avatarUrl }, { where: { id: req.userId } });
    
    res.json({ success: true, avatarUrl });
  } catch (error) {
    console.error('[uploadAvatar]', error);
    res.status(500).json({ error: 'Lỗi khi tải ảnh lên' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { displayName, bio } = req.body;
    await User.update({ displayName, bio }, { where: { id: req.userId } });
    res.json({ success: true, displayName, bio });
  } catch (error) {
    console.error('[updateProfile]', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật hồ sơ' });
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

exports.getStatus = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: ['online', 'lastSeenAt'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ online: user.online, lastSeenAt: user.lastSeenAt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
};

exports.uploadPreKeys = async (req, res) => {
  try {
    const { signedPreKey, oneTimePreKeys } = req.body;
    if (!signedPreKey || !signedPreKey.publicKey || !signedPreKey.signature) {
      return res.status(400).json({ error: 'Signed PreKey and signature are required' });
    }
    await User.sequelize.transaction(async (t) => {
      await PreKey.destroy({ where: { userId: req.userId }, transaction: t });
      await PreKey.create({
        userId: req.userId,
        keyId: 1,
        publicKey: signedPreKey.publicKey,
        signature: signedPreKey.signature,
        type: 'signed'
      }, { transaction: t });
      if (oneTimePreKeys && Array.isArray(oneTimePreKeys)) {
        const opkRecords = oneTimePreKeys.map((k, index) => ({
          userId: req.userId,
          keyId: index + 1,
          publicKey: k.publicKey,
          type: 'one-time'
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
        keyId: index + 1,
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

exports.uploadVault = async (req, res) => {
  try {
    const { vaultData } = req.body;
    if (!vaultData) return res.status(400).json({ error: 'Vault data is required' });
    
    // [Versioning] Increment vaultVersion on every successful sync
    const user = await User.findByPk(req.userId);
    const newVersion = (user.vaultVersion || 0) + 1;
    
    await user.update({ vaultData, vaultVersion: newVersion });
    console.log(`[VAULT] User ${req.userId} uploaded vault (Version: ${newVersion}, size: ${vaultData.length})`);
    res.json({ success: true, vaultVersion: newVersion });
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
        'id', 'username', 'displayName', 'bio', 'avatarUrl', 'themeColor', 
        'online', 'lastSeenAt', 'publicKey', 'dhPublicKey',
        'encryptedPrivateKey', 'keyBackupSalt', 'keyBackupIv', 'vaultVersion'
      ] 
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('[PROFILE Error]', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

exports.clearPreKeys = async (req, res) => {
  try {
    await PreKey.destroy({ where: { userId: req.userId } });
    console.log(`[AUTH-WIPE] Destroyed all PreKeys for user ${req.userId} due to logout.`);
    res.json({ success: true });
  } catch (error) {
    console.error('[clearPreKeys]', error);
    res.status(500).json({ error: 'Failed to clear PreKeys' });
  }
};
