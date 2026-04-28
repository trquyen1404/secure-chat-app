const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const auth = require('../middleware/auth');
const requireGroupMembership = require('../middleware/groupMembership');
const { validate, createGroupSchema } = require('../middleware/validation');

// All routes require authentication
router.use(auth);

// Create a new group (no membership check — creator is being added)
router.post('/', validate(createGroupSchema), groupController.createGroup);

// Get all groups the current user belongs to
router.get('/', groupController.getUserGroups);

// Get group info + members (must be a member)
router.get('/:groupId', requireGroupMembership, groupController.getGroup);

// Get group message history (must be a member)
router.get('/:groupId/messages', requireGroupMembership, groupController.getGroupMessages);

// Send a new group message (must be a member)
router.post('/:groupId/messages', requireGroupMembership, groupController.sendGroupMessage);

// React to a message (must be a member of the group)
router.post('/:groupId/messages/:messageId/react', requireGroupMembership, groupController.reactGroupMessage);

// Delete (revoke) a message (must be a member — ownership check is in the controller)
router.delete('/:groupId/messages/:messageId', requireGroupMembership, groupController.deleteGroupMessage);

// Get group participation statistics
router.get('/:groupId/stats', requireGroupMembership, groupController.getGroupStats);

// Delete a group (admin only)
router.delete('/:groupId', requireGroupMembership, groupController.deleteGroup);

// Update group settings
router.patch('/:groupId/settings', requireGroupMembership, groupController.updateGroupSettings);

// Update member settings
router.patch('/:groupId/members/:memberId/settings', requireGroupMembership, groupController.updateMemberSettings);

module.exports = router;
