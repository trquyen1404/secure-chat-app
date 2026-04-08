const express = require('express');
const { sendRequest, acceptRequest, getFriends } = require('../controllers/friendController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, getFriends);
router.post('/request', auth, sendRequest);
router.post('/accept', auth, acceptRequest);

module.exports = router;
