const express = require('express');
const { getMessages, getPendingMessages, acknowledgeMessages } = require('../controllers/messageController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/pending', auth, getPendingMessages);
router.post('/ack', auth, acknowledgeMessages);
router.get('/:userId', auth, getMessages);

module.exports = router;
