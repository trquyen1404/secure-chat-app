const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const auth = require('../middleware/auth');

router.post('/sessions', auth, attendanceController.createSession);
router.get('/groups/:groupId/sessions', auth, attendanceController.getSessions);
router.post('/submit', auth, attendanceController.submitAttendance);

module.exports = router;
