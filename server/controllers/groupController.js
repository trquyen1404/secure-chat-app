const { v4: uuidv4 } = require('uuid');
const { generateAESKey } = require('../utils/crypto'); // we will reuse generateAESKey from client utils? Actually server may not have this, so we can use crypto library
const crypto = require('crypto');
const { encryptKeyRSA } = require('../utils/crypto'); // assume same utils are available on server side
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');

/**
 * Create a new group.
 * Expected body: { name: string, avatarUrl?: string, memberIds: [uuid] }
 * The creator (req.userId) is automatically added as member.
 */
exports.createGroup = async (req, res) => {
  try {
    const { name, avatarUrl, memberIds } = req.body;
    const creatorId = req.userId;
    if (!name) return res.status(400).json({ error: 'Group name required' });

    // Create group record
    const group = await Group.create({ name, avatarUrl: avatarUrl || null });

    // Generate a random 256‑bit AES key for the group
    const groupKey = crypto.randomBytes(32); // Buffer

    // All members = creator + supplied memberIds (unique)
    const allMemberIds = Array.from(new Set([creatorId, ...(memberIds || [])]));

    // For each member, fetch publicKey and encrypt the group key
    const memberPromises = allMemberIds.map(async (uid) => {
      const user = await User.findByPk(uid);
      if (!user) throw new Error(`User ${uid} not found`);
      const encryptedGroupKey = encryptKeyRSA(groupKey, user.publicKey);
      return GroupMember.create({
        groupId: group.id,
        userId: uid,
        encryptedGroupKey,
      });
    });
    await Promise.all(memberPromises);

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
    const members = await GroupMember.findAll({ where: { groupId }, include: [{ model: User, as: 'User', attributes: ['id', 'username', 'avatarUrl'] }] });
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
    const messages = await GroupMessage.findAll({ where: { groupId }, order: [['createdAt', 'ASC']] });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/** Send a new group message */
exports.sendGroupMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { encryptedContent, encryptedAesKeyForSender, encryptedAesKeyForRecipient, iv, replyToId } = req.body;
    const senderId = req.userId;

    // Save message
    const message = await GroupMessage.create({
      groupId,
      senderId,
      encryptedContent,
      encryptedAesKeyForSender,
      encryptedAesKeyForRecipient,
      iv,
      replyToId: replyToId || null,
    });

    const payload = {
      id: message.id,
      groupId,
      senderId,
      encryptedContent,
      encryptedAesKeyForSender,
      encryptedAesKeyForRecipient,
      iv,
      replyToId: replyToId || null,
      createdAt: message.createdAt,
    };

    // Emit via socket (the socket service will broadcast to all members)
    // Here we just respond OK; actual broadcast is handled in socketService
    res.status(201).json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send group message' });
  }
};

/** React to a group message */
exports.reactGroupMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { reaction } = req.body; // e.g., '❤️' or null to remove
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
    await msg.update({ isDeleted: true, encryptedContent: null, encryptedAesKeyForSender: null, encryptedAesKeyForRecipient: null, iv: null });
    res.json({ messageId, isDeleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete' });
  }
};
