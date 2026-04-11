const GroupMember = require('../models/GroupMember');

/**
 * Middleware: verifies that the authenticated user (req.userId)
 * is a member of the group specified in req.params.groupId.
 * Attaches req.groupMember for downstream use (e.g., encrypted group key).
 */
const requireGroupMembership = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    if (!groupId || groupId === 'undefined') return res.status(400).json({ error: 'groupId is required' });

    // Simple UUID check to prevent DB errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(groupId)) {
      return res.status(400).json({ error: 'ID nhóm không hợp lệ' });
    }

    const member = await GroupMember.findOne({
      where: { groupId, userId: req.userId },
    });

    if (!member) {
      return res.status(403).json({ error: 'Truy cập bị từ chối: Bạn không phải thành viên của nhóm này.' });
    }

    req.groupMember = member; // Contains encryptedGroupKey for re-use in controllers
    next();
  } catch (err) {
    console.error('[requireGroupMembership]', err);
    res.status(500).json({ error: 'Lỗi kiểm tra quyền thành viên nhóm' });
  }
};

module.exports = requireGroupMembership;
