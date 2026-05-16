const express = require('express');
const router = express.Router();
const friendController = require('../controllers/friendController');
const auth = require('../middleware/auth');

router.post('/request', auth, friendController.sendRequest);
router.post('/accept', auth, friendController.acceptRequest);
router.get('/', auth, friendController.getFriends);
router.get('/requests', auth, friendController.getRequests);

module.exports = router;
