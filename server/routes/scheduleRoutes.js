const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const auth = require('../middleware/auth');

router.post('/', auth, scheduleController.addSchedule);
router.get('/', auth, scheduleController.getMySchedule);
router.delete('/:id', auth, scheduleController.deleteSchedule);

module.exports = router;
