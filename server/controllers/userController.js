const { Op, Sequelize } = require('sequelize');
const { User, PreKey, Block, sequelize } = require('../models');
const multer = require('multer');
const path = require('path');

// Configure Multer for Avatar Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/avatars');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const rawExt = path.extname(file.originalname).toLowerCase();
    const cleanExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(rawExt) ? rawExt : '.jpg';
    cb(null, 'user-' + req.userId + '-' + uniqueSuffix + cleanExt);
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
    let otpk = null;
    await sequelize.transaction(async (t) => {
      otpk = await PreKey.findOne({
        where: { userId, type: 'one-time', isUsed: false },
        order: [Sequelize.fn('RANDOM')],
        lock: t.LOCK.UPDATE,
        skipLocked: true,
        transaction: t
      });
      if (otpk) {
        await otpk.update({ isUsed: true }, { transaction: t });
      }
    });
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
      attributes: ['id', 'username', 'displayName', 'online', 'avatarUrl', 'themeColor', 'lastSeenAt', 'publicKey', 'dhPublicKey', 'studentId', 'teacherId', 'phone']
    });

    // Fetch latest message for all users in a single query safely to avoid N+1 query problem
    const peerIds = users.map(u => u.id);
    const latestMap = {};
    if (peerIds.length > 0) {
      const latestMessages = await sequelize.query(
        `SELECT DISTINCT ON (
          CASE 
            WHEN "senderId" = :currentUserId THEN "recipientId" 
            ELSE "senderId" 
          END
         ) 
          id, 
          "senderId", 
          "recipientId", 
          "encryptedContent", 
          "readAt", 
          "createdAt", 
          "type",
          CASE 
            WHEN "senderId" = :currentUserId THEN "recipientId" 
            ELSE "senderId" 
          END AS "peerId"
        FROM "Messages"
        WHERE (
          ("senderId" = :currentUserId AND "recipientId" IN (:peerIds))
          OR 
          ("recipientId" = :currentUserId AND "senderId" IN (:peerIds))
        )
        AND "type" NOT IN ('handshake_ack', 'SENDER_KEY_DISTRIBUTION', 'SESSION_DESYNC_ERROR')
        AND ("senderEk" IS NULL OR "encryptedContent" IS NOT NULL)
        ORDER BY "peerId", "createdAt" DESC`,
        {
          replacements: { currentUserId, peerIds },
          type: sequelize.QueryTypes.SELECT
        }
      );
      latestMessages.forEach(m => {
        latestMap[m.peerId] = m;
      });
    }

    const usersWithLatestMsg = users.map(u => ({
      ...u.get({ plain: true }),
      latestMessage: latestMap[u.id] || null
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
    const { displayName, bio, studentId, teacherId, phone } = req.body;
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = {};
    if (displayName !== undefined) updates.displayName = displayName;
    if (bio !== undefined) updates.bio = bio;

    if (user.role === 'student') {
      if (teacherId !== undefined && teacherId !== null) {
        return res.status(403).json({ error: 'Sinh viên không thể cập nhật Mã giảng viên' });
      }
      if (studentId !== undefined && studentId !== null) {
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(studentId)) {
          return res.status(400).json({ error: 'Mã sinh viên không hợp lệ (3-20 ký tự, chỉ chứa chữ, số, gạch ngang, gạch dưới)' });
        }
        const existing = await User.findOne({ where: { studentId, id: { [Op.ne]: req.userId } } });
        if (existing) {
          return res.status(400).json({ error: 'Mã sinh viên đã tồn tại trong hệ thống' });
        }
        updates.studentId = studentId;
      }
    } else if (user.role === 'teacher') {
      if (studentId !== undefined && studentId !== null) {
        return res.status(403).json({ error: 'Giảng viên không thể cập nhật Mã sinh viên' });
      }
      if (teacherId !== undefined && teacherId !== null) {
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(teacherId)) {
          return res.status(400).json({ error: 'Mã giảng viên không hợp lệ (3-20 ký tự, chỉ chứa chữ, số, gạch ngang, gạch dưới)' });
        }
        const existing = await User.findOne({ where: { teacherId, id: { [Op.ne]: req.userId } } });
        if (existing) {
          return res.status(400).json({ error: 'Mã giảng viên đã tồn tại trong hệ thống' });
        }
        updates.teacherId = teacherId;
      }
    }

    if (phone !== undefined && phone !== null) {
      if (!/^[0-9]{9,11}$/.test(phone)) {
        return res.status(400).json({ error: 'Số điện thoại không hợp lệ (chỉ chứa số, từ 9-11 ký tự)' });
      }
      const existing = await User.findOne({ where: { phone, id: { [Op.ne]: req.userId } } });
      if (existing) {
        return res.status(400).json({ error: 'Số điện thoại đã được sử dụng' });
      }
      updates.phone = phone;
    }

    await user.update(updates);
    res.json({ success: true, ...updates });
  } catch (error) {
    console.error('[updateProfile]', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật hồ sơ' });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    let { query } = req.query;
    if (!query || query.length < 2) return res.json([]);
    if (query.length > 50) {
      query = query.substring(0, 50);
    }
    const escapedQuery = query.replace(/[%_]/g, '\\$&');

    const currentUserId = req.userId;
    const blocks = await Block.findAll({
      where: { [Op.or]: [{ blockerId: currentUserId }, { blockedId: currentUserId }] },
      raw: true
    });
    const blockedIds = blocks.map(b => b.blockerId === currentUserId ? b.blockedId : b.blockerId);

    const users = await User.findAll({
      where: {
        [Op.and]: [
          { id: { [Op.ne]: currentUserId } },
          { id: { [Op.notIn]: blockedIds } },
          {
            [Op.or]: [
              { username: { [Op.iLike]: `%${escapedQuery}%` } },
              { displayName: { [Op.iLike]: `%${escapedQuery}%` } },
              { studentId: { [Op.iLike]: `%${escapedQuery}%` } },
              { teacherId: { [Op.iLike]: `%${escapedQuery}%` } },
              { phone: { [Op.iLike]: `%${escapedQuery}%` } },
            ]
          }
        ]
      },
      attributes: ['id', 'username', 'displayName', 'avatarUrl', 'studentId', 'teacherId', 'phone', 'online', 'role'],
      limit: 20
    });

    res.json(users);
  } catch (error) {
    console.error('[searchUsers]', error);
    res.status(500).json({ error: 'Lỗi khi tìm kiếm người dùng' });
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
    if (oneTimePreKeys && Array.isArray(oneTimePreKeys) && oneTimePreKeys.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 One-Time PreKeys allowed' });
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
    if (oneTimePreKeys.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 One-Time PreKeys allowed' });
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
        'id', 'username', 'email', 'displayName', 'bio', 'avatarUrl', 'themeColor', 
        'online', 'lastSeenAt', 'publicKey', 'dhPublicKey',
        'encryptedPrivateKey', 'keyBackupSalt', 'keyBackupIv', 'vaultVersion',
        'studentId', 'teacherId', 'phone', 'role', 'isVerified'
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
    await PreKey.destroy({ where: { userId: req.userId, type: 'one-time' } });
    console.log(`[AUTH-WIPE] Destroyed all one-time PreKeys for user ${req.userId} due to logout.`);
    res.json({ success: true });
  } catch (error) {
    console.error('[clearPreKeys]', error);
    res.status(500).json({ error: 'Failed to clear PreKeys' });
  }
};

exports.updateFolders = async (req, res) => {
  try {
    const { folders } = req.body;
    if (!Array.isArray(folders)) return res.status(400).json({ error: 'Folders must be an array' });
    await User.update({ folders }, { where: { id: req.userId } });
    res.json({ success: true, folders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update folders' });
  }
};

exports.getFolders = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, { attributes: ['folders'] });
    res.json(user.folders || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
};
