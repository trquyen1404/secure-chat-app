const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

// Profile & Me
router.get('/me', auth, userController.getMe);
router.get('/profile', auth, userController.getMe); // Alias for legacy/mobile support
router.get('/search', auth, userController.searchUsers);
router.get('/contacts', auth, userController.getUsers); // Map contacts to getUsers
router.get('/:id', auth, userController.getProfile);
router.put('/profile', auth, userController.updateProfile);
router.post('/avatar', auth, userController.uploadAvatarMiddleware, userController.uploadAvatar);

// PreKeys & X3DH
router.get('/:userId/prekey-bundle', auth, userController.getPreKeyBundle);
router.post('/prekeys', auth, userController.updatePreKeys);
router.post('/opks', auth, userController.uploadOpks);
router.delete('/opks', auth, userController.clearPreKeys);

// Vault Sync
router.post('/vault', auth, userController.uploadVault);
router.get('/vault', auth, userController.downloadVault);

// Block List
router.post('/block', auth, userController.blockUser);
router.post('/unblock', auth, userController.unblockUser);
router.get('/blocked', auth, userController.getBlockedUsers);

// Push Notifications
router.post('/push-subscription', auth, userController.updatePushSubscription);

module.exports = router;