const express = require('express');
const { getMessages } = require('../controllers/messageController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/:userId', auth, getMessages);

module.exports = router;
