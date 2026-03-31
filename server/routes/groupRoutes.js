const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Create a new group
router.post('/', groupController.createGroup);

// Join an existing group (by invitation code or ID)
router.post('/:groupId/join', groupController.joinGroup);

// Get group info + members
router.get('/:groupId', groupController.getGroup);

// Get group message history
router.get('/:groupId/messages', groupController.getGroupMessages);

// Send a new group message
router.post('/:groupId/messages', groupController.sendGroupMessage);

module.exports = router;
