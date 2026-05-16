const express = require('express');
const messageController = require('../controllers/messageController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/pending', auth, messageController.getPendingMessages);
router.post('/ack', auth, messageController.acknowledgeMessages);
router.get('/:userId', auth, messageController.getMessages);
router.get('/:userId/pinned', auth, messageController.getPinnedMessages);
router.post('/:messageId/pin', auth, messageController.togglePinMessage);

module.exports = router;
