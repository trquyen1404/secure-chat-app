const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const auth = require('../middleware/auth');
const requireGroupMembership = require('../middleware/groupMembership');

router.post('/', auth, requireGroupMembership, assignmentController.createAssignment);
router.get('/groups/:groupId', auth, requireGroupMembership, assignmentController.getGroupAssignments);
router.post('/submit', auth, assignmentController.submitAssignment);
router.patch('/grade/:submissionId', auth, assignmentController.gradeSubmission);

module.exports = router;
