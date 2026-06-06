const { Op } = require('sequelize');
const { Group, GroupMember, GroupMessage, User, sequelize, Poll, PollOption, PollVote, Assignment, Submission, Exam, Question, FlashcardSet, Flashcard, AttendanceSession, AttendanceRecord, Note, Resource, Announcement, Grade, Confession, SecretSantaSession } = require('../models');

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

    if (memberIds && Array.isArray(memberIds) && memberIds.length > 400) {
      return res.status(400).json({ error: 'Nhóm tối đa 400 thành viên' });
    }

    // Generate random 6-character code cryptographically securely
    const crypto = require('crypto');
    const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    const group = await Group.create({ 
      name, 
      avatarUrl: avatarUrl || null, 
      createdBy: creatorId,
      inviteCode 
    });

    const allMemberIds = Array.from(new Set([creatorId, ...(memberIds || [])]));

    const memberRows = allMemberIds.map((uid) => ({
      groupId: group.id,
      userId: uid,
      role: String(uid) === String(creatorId) ? 'admin' : 'member',
    }));
    await GroupMember.bulkCreate(memberRows);

    res.status(201).json({ 
      id: group.id, 
      name: group.name, 
      avatarUrl: group.avatarUrl, 
      createdBy: group.createdBy,
      inviteCode: group.inviteCode
    });
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
      attributes: ['id', 'groupId', 'senderId', 'encryptedContent', 'ratchetKey', 'n', 'pn', 'iv', 'signature', 'type', 'localId', 'isPinned', 'expiresAt', 'createdAt'],
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
    const { encryptedContent, ratchetKey, n, pn, iv, replyToId, signature, index } = req.body;
    const senderId = req.userId;

    const message = await GroupMessage.create({
      groupId,
      senderId,
      encryptedContent,
      ratchetKey,
      n: (index !== undefined ? index : n) || 0,
      pn,
      iv,
      signature: signature || null,
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
      localId: message.localId,
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

/** Get all groups the current user belongs to */
exports.getUserGroups = async (req, res) => {
  try {
    const userId = req.userId;
    const groupMemberships = await GroupMember.findAll({
      where: { userId },
      attributes: ['lastReadMessageId'],
      include: [{ 
        model: Group, 
        as: 'Group',
        attributes: ['id', 'name', 'avatarUrl', 'createdBy', 'createdAt', 'themeColor', 'quickEmoji', 'selfDestructTimer']
      }]
    });
    
    const groupIds = groupMemberships.map(m => m.Group?.id).filter(Boolean);
    if (groupIds.length === 0) {
      return res.json([]);
    }

    // Fetch latest message for all groups in a single query safely without SQL Injection
    const latestMessages = await sequelize.query(
      `SELECT DISTINCT ON ("groupId") id, "groupId", "senderId", "encryptedContent", "createdAt", "type"
       FROM "GroupMessages"
       WHERE "groupId" IN (:groupIds)
         AND "type" NOT IN ('handshake_ack', 'SENDER_KEY_DISTRIBUTION', 'SESSION_DESYNC_ERROR')
       ORDER BY "groupId", "createdAt" DESC`,
      {
        replacements: { groupIds },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const latestMap = {};
    latestMessages.forEach(m => {
      latestMap[m.groupId] = m;
    });

    const groups = groupMemberships
      .filter(m => m.Group)
      .map(m => ({
        ...m.Group.get({ plain: true }),
        lastReadMessageId: m.lastReadMessageId,
        latestMessage: latestMap[m.Group.id] || null
      }));

    res.json(groups);
  } catch (err) {
    console.error('[getUserGroups]', err);
    res.status(500).json({ error: 'Failed to fetch user groups' });
  }
};

/** Join a group via invite code */
exports.joinByCode = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'Vui lòng nhập mã mời' });

    const group = await Group.findOne({ where: { inviteCode } });
    if (!group) return res.status(404).json({ error: 'Mã mời không hợp lệ hoặc nhóm không tồn tại' });

    const existingMember = await GroupMember.findOne({ where: { groupId: group.id, userId: req.userId } });
    if (existingMember) return res.status(400).json({ error: 'Bạn đã là thành viên của nhóm này' });

    await GroupMember.create({
      groupId: group.id,
      userId: req.userId,
      role: 'member',
    });

    try {
      const socketService = require('../services/socketService');
      if (socketService && typeof socketService.invalidateMembershipCache === 'function') {
        socketService.invalidateMembershipCache(group.id);
      }
    } catch (e) {
      console.error('[groupController] failed to invalidate cache:', e);
    }

    res.json({ message: 'Tham gia nhóm thành công', group });
  } catch (err) {
    console.error('[joinByCode]', err);
    res.status(500).json({ error: 'Lỗi khi tham gia nhóm' });
  }
};

/** Toggle Mute All (Only Admin) */
exports.toggleMute = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { isMuted } = req.body;
    
    const member = await GroupMember.findOne({ where: { groupId, userId: req.userId } });
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên mới được thay đổi cài đặt này' });
    }

    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });

    group.isMuted = isMuted;
    await group.save();

    res.json({ message: `Đã ${isMuted ? 'khóa' : 'mở khóa'} tính năng chat của sinh viên.`, isMuted });
  } catch (err) {
    console.error('[toggleMute]', err);
    res.status(500).json({ error: 'Lỗi khi thay đổi cài đặt nhóm' });
  }
};

/** Get group participation statistics (% messages per member) */
exports.getGroupStats = async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Count total messages in group (excluding purely technical ones if desired, but here we include all)
    const totalMessages = await GroupMessage.count({ 
      where: { 
        groupId,
        type: { [Op.notIn]: ['SENDER_KEY_DISTRIBUTION', 'handshake_ack', 'SESSION_DESYNC_ERROR'] }
      } 
    });
    
    if (totalMessages === 0) {
      return res.json({ totalMessages: 0, stats: [] });
    }

    // Get count per sender
    const stats = await GroupMessage.findAll({
      where: { 
        groupId,
        type: { [Op.notIn]: ['SENDER_KEY_DISTRIBUTION', 'handshake_ack', 'SESSION_DESYNC_ERROR'] }
      },
      attributes: [
        'senderId',
        [sequelize.fn('COUNT', sequelize.col('GroupMessage.id')), 'messageCount']
      ],
      group: ['senderId'],
      raw: true
    });

    // Fetch user details for the senders found
    const senderIds = stats.map(s => s.senderId);
    const users = await User.findAll({
      where: { id: senderIds },
      attributes: ['id', 'username', 'displayName', 'avatarUrl']
    });

    const userMap = {};
    users.forEach(u => {
      userMap[u.id] = u;
    });

    const formattedStats = stats.map(s => {
      const u = userMap[s.senderId];
      const count = parseInt(s.messageCount);
      return {
        userId: s.senderId,
        username: u?.username,
        displayName: u?.displayName,
        avatarUrl: u?.avatarUrl,
        messageCount: count,
        percentage: ((count / totalMessages) * 100).toFixed(1)
      };
    }).sort((a, b) => b.messageCount - a.messageCount);

    res.json({ totalMessages, stats: formattedStats });
  } catch (err) {
    console.error('[getGroupStats] Error:', err);
    res.status(500).json({ error: 'Failed to fetch group statistics' });
  }
};

/** Delete a group (admin only) */
exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    // Check if user is admin or creator
    const membership = await GroupMember.findOne({ where: { groupId, userId: req.userId } });
    const isAdmin = membership?.role === 'admin' || String(group.createdBy) === String(req.userId);
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only group admins can delete the group' });
    }

    // [Cleanup] Cascade delete all satellite data using a transaction to avoid foreign key constraints
    const t = await sequelize.transaction();
    try {
      // Find all IDs to delete dependent sub-records
      const polls = await Poll.findAll({ where: { groupId }, transaction: t });
      const pollIds = polls.map(p => p.id);

      const assignments = await Assignment.findAll({ where: { groupId }, transaction: t });
      const assignmentIds = assignments.map(a => a.id);

      const exams = await Exam.findAll({ where: { groupId }, transaction: t });
      const examIds = exams.map(e => e.id);

      const flashcardSets = await FlashcardSet.findAll({ where: { groupId }, transaction: t });
      const setIds = flashcardSets.map(f => f.id);

      const sessions = await AttendanceSession.findAll({ where: { groupId }, transaction: t });
      const sessionIds = sessions.map(s => s.id);

      // 1. Delete deeply nested records (leaf nodes first)
      if (pollIds.length > 0) {
        await PollVote.destroy({ where: { pollId: { [Op.in]: pollIds } }, transaction: t });
        await PollOption.destroy({ where: { pollId: { [Op.in]: pollIds } }, transaction: t });
      }
      await Poll.destroy({ where: { groupId }, transaction: t });

      if (assignmentIds.length > 0) {
        await Submission.destroy({ where: { assignmentId: { [Op.in]: assignmentIds } }, transaction: t });
      }
      await Assignment.destroy({ where: { groupId }, transaction: t });

      if (examIds.length > 0) {
        await Question.destroy({ where: { examId: { [Op.in]: examIds } }, transaction: t });
      }
      await Exam.destroy({ where: { groupId }, transaction: t });

      if (setIds.length > 0) {
        await Flashcard.destroy({ where: { setId: { [Op.in]: setIds } }, transaction: t });
      }
      await FlashcardSet.destroy({ where: { groupId }, transaction: t });

      if (sessionIds.length > 0) {
        await AttendanceRecord.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, transaction: t });
      }
      await AttendanceSession.destroy({ where: { groupId }, transaction: t });

      // 2. Delete direct satellite records
      await Note.destroy({ where: { groupId }, transaction: t });
      await Resource.destroy({ where: { groupId }, transaction: t });
      await Announcement.destroy({ where: { groupId }, transaction: t });
      await Grade.destroy({ where: { groupId }, transaction: t });
      await Confession.destroy({ where: { groupId }, transaction: t });
      
      if (SecretSantaSession) {
        await SecretSantaSession.destroy({ where: { groupId }, transaction: t });
      }

      // 3. Delete group members and group messages
      await GroupMember.destroy({ where: { groupId }, transaction: t });
      await GroupMessage.destroy({ where: { groupId }, transaction: t });

      // 4. Finally destroy the group
      await group.destroy({ transaction: t });

      await t.commit();
    } catch (txError) {
      await t.rollback();
      throw txError;
    }
    
    try {
      const socketService = require('../services/socketService');
      if (socketService && typeof socketService.invalidateMembershipCache === 'function') {
        socketService.invalidateMembershipCache(groupId);
      }
    } catch (e) {
      console.error('[groupController] failed to invalidate cache:', e);
    }

    res.json({ message: 'Group deleted successfully', groupId });
  } catch (err) {
    console.error('[deleteGroup] Error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
};

/** Update group settings (theme, emoji, etc.) */
exports.updateGroupSettings = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { themeColor, quickEmoji, selfDestructTimer } = req.body;
    
    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Allow any member to update group settings for better collaboration (Signal-style)
    const membership = await GroupMember.findOne({ where: { groupId, userId: req.userId } });
    if (!membership) {
      return res.status(403).json({ error: 'You must be a member of this group' });
    }

    if (themeColor) group.themeColor = themeColor;
    if (quickEmoji) group.quickEmoji = quickEmoji;
    
    // selfDestructTimer là setting nhạy cảm — chỉ admin được thay đổi
    if (selfDestructTimer !== undefined) {
      if (membership.role !== 'admin') {
        return res.status(403).json({ error: 'Chỉ admin mới có thể thay đổi bộ hẹn giờ tự hủy' });
      }
      group.selfDestructTimer = selfDestructTimer;
    }
    
    await group.save();
    res.json(group);
  } catch (err) {
    console.error('[updateGroupSettings] Error:', err);
    res.status(500).json({ error: 'Failed to update group settings' });
  }
};

/** Update member-specific settings (nickname, mute) */
exports.updateMemberSettings = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const { nickname, muteNotifications } = req.body;

    const membership = await GroupMember.findOne({ where: { groupId, userId: memberId } });
    if (!membership) return res.status(404).json({ error: 'Membership not found' });

    // User can only update their own settings, or admin can update nicknames
    if (String(memberId) !== String(req.userId)) {
      const requester = await GroupMember.findOne({ where: { groupId, userId: req.userId } });
      if (requester?.role !== 'admin') {
         return res.status(403).json({ error: 'Permission denied' });
      }
    }

    if (nickname !== undefined) membership.nickname = nickname;
    if (muteNotifications !== undefined) membership.muteNotifications = muteNotifications;

    await membership.save();
    res.json(membership);
  } catch (err) {
    console.error('[updateMemberSettings] Error:', err);
    res.status(500).json({ error: 'Failed to update member settings' });
  }
};

/** Kick a member from the group (Admin only) */
exports.kickMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const requesterId = req.userId;

    // 1. Check if the requester is an admin in this group
    const requesterMembership = await GroupMember.findOne({ where: { groupId, userId: requesterId } });
    if (!requesterMembership || requesterMembership.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ quản trị viên mới được xóa thành viên khỏi nhóm' });
    }

    // 2. Find the membership of the member to kick
    const memberMembership = await GroupMember.findOne({ where: { groupId, userId: memberId } });
    if (!memberMembership) {
      return res.status(404).json({ error: 'Thành viên không tồn tại trong nhóm' });
    }

    // Cannot kick oneself
    if (String(memberId) === String(requesterId)) {
      return res.status(400).json({ error: 'Bạn không thể tự xóa bản thân khỏi nhóm' });
    }

    // 3. Delete membership
    await memberMembership.destroy();

    // 4. Invalidate socket membership cache and boot user's socket room
    try {
      const socketService = require('../services/socketService');
      if (socketService && typeof socketService.invalidateMembershipCache === 'function') {
        socketService.invalidateMembershipCache(groupId);
      }
      if (socketService && typeof socketService.kickUserFromGroupRoom === 'function') {
        socketService.kickUserFromGroupRoom(memberId, groupId);
      }
    } catch (e) {
      console.error('[groupController] failed to invalidate cache or kick socket room:', e);
    }

    res.json({ message: 'Đã xóa thành viên khỏi nhóm thành công', memberId });
  } catch (err) {
    console.error('[kickMember] Error:', err);
    res.status(500).json({ error: 'Lỗi khi xóa thành viên khỏi nhóm' });
  }
};

/** Toggle pin status for a group message (Admin only) */
exports.togglePinGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const msg = await GroupMessage.findByPk(messageId);
    if (!msg || msg.groupId !== groupId) return res.status(404).json({ error: 'Message not found' });

    // Admin check
    const membership = await GroupMember.findOne({ where: { groupId, userId: req.userId } });
    if (membership?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can pin messages' });
    }

    await msg.update({ isPinned: !msg.isPinned });
    res.json({ messageId, isPinned: msg.isPinned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to pin' });
  }
};

/** Get all pinned messages in a group */
exports.getPinnedGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const messages = await GroupMessage.findAll({
      where: { groupId, isPinned: true },
      order: [['createdAt', 'DESC']]
    });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pinned messages' });
  }
};

/** Get read status (lastReadMessageId) for all group members */
exports.getReadStatus = async (req, res) => {
  try {
    const { groupId } = req.params;
    const members = await GroupMember.findAll({
      where: { groupId },
      include: [
        { 
          model: User, 
          as: 'User', 
          attributes: ['id', 'username', 'avatarUrl', 'displayName'] 
        },
        {
          model: User.sequelize.models.GroupMessage,
          as: 'LastReadMessage',
          attributes: ['createdAt']
        }
      ],
      attributes: ['userId', 'lastReadMessageId']
    });
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
