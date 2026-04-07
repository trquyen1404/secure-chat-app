const { Op } = require('sequelize');
const { Group, GroupMember, GroupMessage, User } = require('../models');

/**
 * Create a new group.
 * Expected body: { name: string, avatarUrl?: string, memberIds: [uuid] }
 * The creator (req.userId) is automatically added as admin member.
 */
exports.createGroup = async (req, res) => {
  try {
    const { name, avatarUrl, memberIds } = req.body;
    const creatorId = req.userId;
    if (!name) return res.status(400).json({ error: 'Group name required' });

    const group = await Group.create({ name, avatarUrl: avatarUrl || null, createdBy: creatorId });

    const allMemberIds = Array.from(new Set([creatorId, ...(memberIds || [])]));

    const memberRows = allMemberIds.map((uid) => ({
      groupId: group.id,
      userId: uid,
      role: uid === creatorId ? 'admin' : 'member',
    }));
    await GroupMember.bulkCreate(memberRows);

    res.status(201).json({ groupId: group.id, name: group.name, avatarUrl: group.avatarUrl });
  } catch (err) {
    console.error('createGroup error', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

/** Get group info + members */
exports.getGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const members = await GroupMember.findAll({
      where: { groupId },
      include: [{ model: User, as: 'User', attributes: ['id', 'username', 'avatarUrl', 'publicKey'] }]
    });
    res.json({ group, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
};

/** Get group message history */
exports.getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { cursor } = req.query;
    const limit = 50;

    const whereClause = { groupId };
    if (cursor) {
      whereClause.createdAt = { [Op.lt]: new Date(cursor) };
    }

    const messages = await GroupMessage.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit
    });

    res.json(messages.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/** Send a new group message (Double Ratchet format) */
exports.sendGroupMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { encryptedContent, ratchetKey, n, pn, iv, replyToId } = req.body;
    const senderId = req.userId;

    const message = await GroupMessage.create({
      groupId,
      senderId,
      encryptedContent,
      ratchetKey,
      n,
      pn,
      iv,
      replyToId: replyToId || null,
    });

    res.status(201).json({
      id: message.id,
      groupId,
      senderId,
      encryptedContent,
      ratchetKey,
      n,
      pn,
      iv,
      replyToId: replyToId || null,
      createdAt: message.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send group message' });
  }
};

/** React to a group message */
exports.reactGroupMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { reaction } = req.body;
    const msg = await GroupMessage.findByPk(messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const current = { ...(msg.reactions || {}) };
    if (!reaction) delete current[req.userId]; else current[req.userId] = reaction;
    await msg.update({ reactions: current });
    res.json({ messageId, reactions: current });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to react' });
  }
};

/** Delete (revoke) a group message */
exports.deleteGroupMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const msg = await GroupMessage.findByPk(messageId);
    if (!msg || msg.senderId !== req.userId) return res.status(403).json({ error: 'Not allowed' });
    await msg.update({ isDeleted: true, encryptedContent: null, ratchetKey: null, iv: null });
    res.json({ messageId, isDeleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete' });
  }
};

