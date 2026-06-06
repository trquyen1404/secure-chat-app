const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const auth = require('../middleware/auth');
const requireGroupMembership = require('../middleware/groupMembership');

const { validate, createSessionSchema } = require('../middleware/validation');

router.post('/sessions', auth, requireGroupMembership, validate(createSessionSchema), attendanceController.createSession);
router.get('/groups/:groupId/sessions', auth, requireGroupMembership, attendanceController.getSessions);
router.post('/submit', auth, attendanceController.submitAttendance);

module.exports = router;
