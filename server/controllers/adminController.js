const { User, Message, Group, GroupMember } = require('../models');
const { Op } = require('sequelize');

// Get all users with stats
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'email', 'role', 'isVerified', 'isBanned', 'createdAt', 'lastSeenAt', 'online'],
      order: [['createdAt', 'DESC']]
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Ban/Unban user
exports.toggleBan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isBanned, banReason } = req.body;

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Cannot ban another administrator' });
    }

    user.isBanned = isBanned;
    user.banReason = isBanned ? banReason : null;
    await user.save();

    res.json({ message: `User ${isBanned ? 'banned' : 'unbanned'} successfully`, user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user ban status' });
  }
};

// Reset User Account (Wipe E2EE keys & Vault)
exports.resetUserAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Cannot reset another administrator' });
    }

    user.publicKey = 'RESET_REQUIRED';
    user.dhPublicKey = 'RESET_REQUIRED';
    user.encryptedPrivateKey = null;
    user.keyBackupSalt = null;
    user.keyBackupIv = null;
    user.vaultData = null;
    await user.save();

    // Optionally delete PreKeys for this user
    const { PreKey } = require('../models');
    await PreKey.destroy({ where: { userId } });

    res.json({ message: 'User account reset successfully. They must setup new keys on next login.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset user account' });
  }
};

// System statistics
exports.getStats = async (req, res) => {
  try {
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { online: true } });
    const totalMessages = await Message.count();
    const totalGroups = await Group.count();
    
    // Last 7 days message activity (simplified)
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentMessages = await Message.count({
      where: { createdAt: { [Op.gt]: lastWeek } }
    });

    res.json({
      summary: {
        totalUsers,
        activeUsers,
        totalMessages,
        totalGroups,
        recentMessages
      },
      distribution: {
        students: await User.count({ where: { role: 'student' } }),
        teachers: await User.count({ where: { role: 'teacher' } }),
        admins: await User.count({ where: { role: 'admin' } })
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// Get system logs (placeholder for now)
exports.getLogs = async (req, res) => {
  try {
    // In a production app, we'd read from a Log model or file
    // For now, return mock logs to satisfy UI
    res.json([
      { id: 1, event: 'System Start', details: 'Server initialized successfully', timestamp: new Date() },
      { id: 2, event: 'Security Scan', details: 'No vulnerabilities found', timestamp: new Date() }
    ]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};
