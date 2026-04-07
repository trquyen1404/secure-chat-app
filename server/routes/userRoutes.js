const express = require('express');
const { 
  getUsers, 
  getPreKeyBundle, 
  uploadPreKeys, 
  uploadVault, 
  downloadVault,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getProfile
} = require('../controllers/userController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, getUsers);
router.get('/:userId/prekey-bundle', auth, getPreKeyBundle);
router.post('/prekeys', auth, uploadPreKeys);
router.post('/vault', auth, uploadVault);
router.get('/vault', auth, downloadVault);

// Block list routes
router.post('/block', auth, blockUser);
router.post('/unblock', auth, unblockUser);
router.get('/blocked', auth, getBlockedUsers);
router.get('/profile', auth, getProfile);

module.exports = router;
