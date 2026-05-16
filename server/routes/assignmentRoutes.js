const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const auth = require('../middleware/auth');

router.post('/', auth, assignmentController.createAssignment);
router.get('/groups/:groupId', auth, assignmentController.getGroupAssignments);
router.post('/submit', auth, assignmentController.submitAssignment);
router.patch('/grade/:submissionId', auth, assignmentController.gradeSubmission);

module.exports = router;
