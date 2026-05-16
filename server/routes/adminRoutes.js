const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/role');

// All admin routes are protected by auth and isAdmin role check
router.use(auth, isAdmin);

router.get('/users', adminController.getAllUsers);
router.post('/users/:userId/ban', adminController.toggleBan);
router.post('/users/:userId/reset', adminController.resetUserAccount);
router.get('/stats', adminController.getStats);
router.get('/logs', adminController.getLogs);

module.exports = router;
