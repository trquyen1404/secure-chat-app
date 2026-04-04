const express = require('express');
const { createStory, getStories } = require('../controllers/storyController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth, createStory);
router.get('/', auth, getStories);

module.exports = router;
