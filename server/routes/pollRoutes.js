const express = require('express');
const router = express.Router();
const pollController = require('../controllers/pollController');
const auth = require('../middleware/auth');

router.post('/', auth, pollController.createPoll);
router.get('/groups/:groupId', auth, pollController.getGroupPolls);
router.post('/vote', auth, pollController.vote);

module.exports = router;
