const { Op, Sequelize } = require('sequelize');
const User = require('../models/User');
const PreKey = require('../models/PreKey');

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
    const users = await User.findAll({
      where: { id: { [Op.ne]: req.userId } },
      attributes: ['id', 'username', 'online', 'avatarUrl', 'themeColor', 'lastSeenAt', 'publicKey', 'dhPublicKey']
    });
    res.json(users);
  } catch (error) {
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
