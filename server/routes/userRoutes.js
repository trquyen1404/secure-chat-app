const express = require('express');
const { getUsers, updateAvatar, updateTheme, getStatus, getProfile, updateProfile, getPins, pinChat, unpinChat } = require('../controllers/userController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, getUsers);
router.get('/pins', auth, getPins);
router.post('/pins', auth, pinChat);
router.delete('/pins/:targetUserId', auth, unpinChat);
router.get('/:id/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);

module.exports = router;
