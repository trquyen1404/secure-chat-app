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
  getProfile,
  uploadOpks,
  updateProfile,
  uploadAvatar,
  uploadAvatarMiddleware,
  clearPreKeys,
  updateFolders,
  getFolders
} = require('../controllers/userController');
const auth = require('../middleware/auth');
const { validate, uploadPreKeysSchema, uploadOpksSchema } = require('../middleware/validation');

const router = express.Router();

router.get('/', auth, getUsers);
router.get('/search', auth, require('../controllers/userController').searchUsers);
router.get('/:userId/prekey-bundle', auth, getPreKeyBundle);
router.post('/prekeys', auth, validate(uploadPreKeysSchema), uploadPreKeys);
router.post('/opks', auth, validate(uploadOpksSchema), uploadOpks);
router.post('/vault', auth, uploadVault);
router.get('/vault', auth, downloadVault);

// Block list routes
router.post('/block', auth, blockUser);
router.post('/unblock', auth, unblockUser);
router.get('/blocked', auth, getBlockedUsers);
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.post('/avatar', auth, uploadAvatarMiddleware, uploadAvatar);

router.delete('/opks', auth, clearPreKeys);
router.get('/folders', auth, getFolders);
router.post('/folders', auth, updateFolders);

module.exports = router;
