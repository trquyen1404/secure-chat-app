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
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public routes
router.post('/register', userController.register);
router.post('/login', userController.login);

// Private routes (Cần token)
router.get('/me', authenticateToken, userController.getMe);
router.get('/contacts', authenticateToken, userController.getContacts);
router.get('/search', authenticateToken, userController.searchUsers);
router.get('/:id', authenticateToken, userController.getUserProfile);

// Routes phục vụ X3DH Handshake
router.get('/:id/prekey-bundle', authenticateToken, userController.getPreKeyBundle);
router.post('/update-prekeys', authenticateToken, userController.updatePreKeys);

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