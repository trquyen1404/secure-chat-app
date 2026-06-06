const express = require('express');
const router = express.Router();
const pollController = require('../controllers/pollController');
const auth = require('../middleware/auth');
const requireGroupMembership = require('../middleware/groupMembership');

router.post('/', auth, requireGroupMembership, pollController.createPoll);
router.get('/groups/:groupId', auth, requireGroupMembership, pollController.getGroupPolls);
router.post('/vote', auth, pollController.vote);

module.exports = router;
