const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticateToken = require('../middleware/auth');
// const upload = require('../middleware/upload');

// Private routes (Cần token)
router.get('/me', authenticateToken, userController.getMe);
router.get('/contacts', authenticateToken, userController.getContacts);
router.get('/search', authenticateToken, userController.searchUsers);
router.get('/:id', authenticateToken, userController.getUserProfile);

// Routes phục vụ X3DH Handshake
router.get('/:id/prekey-bundle', authenticateToken, userController.getPreKeyBundle);
router.post('/update-prekeys', authenticateToken, userController.updatePreKeys);

// Cập nhật profile & Push notification
router.put('/profile', authenticateToken, userController.updateProfile);
router.post('/push-subscription', authenticateToken, userController.updatePushSubscription);

module.exports = router;