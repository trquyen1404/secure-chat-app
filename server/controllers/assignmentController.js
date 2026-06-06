const { Assignment, Submission, User, Group, GroupMember } = require('../models');
const notificationService = require('../services/notificationService');

exports.createAssignment = async (req, res) => {
  try {
    const { groupId, title, description, deadline, fileUrl, points } = req.body;
    const teacherId = req.userId;

    // Check permissions: creator must be a teacher OR group admin
    const member = await GroupMember.findOne({ where: { groupId, userId: teacherId } });
    if (!member || (member.role !== 'admin' && req.user.role !== 'teacher')) {
      return res.status(403).json({ error: 'Chỉ giảng viên hoặc quản trị viên nhóm mới có quyền thực hiện hành động này.' });
    }
    const assignment = await Assignment.create({
      groupId,
      teacherId,
      title,
      description,
      deadline,
      fileUrl,
      points
    });

    // Notify group
    notificationService.sendGroupNotification(groupId, {
      title: '📚 Bài tập mới',
      body: `Bài tập mới: ${title}. Hạn chót: ${new Date(deadline).toLocaleString('vi-VN')}`,
      url: `/`,
      tag: `assignment-${assignment.id}`
    }, teacherId);

    res.status(201).json(assignment);
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getGroupAssignments = async (req, res) => {
  try {
    const { groupId } = req.params;
    const assignments = await Assignment.findAll({
      where: { groupId },
      include: [
        { model: User, as: 'Teacher', attributes: ['id', 'username', 'displayName'] },
        { 
          model: Submission, 
          as: 'Submissions', 
          include: [{ model: User, as: 'Student', attributes: ['id', 'username', 'displayName'] }] 
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(assignments);
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.submitAssignment = async (req, res) => {
  try {
    const { assignmentId, fileUrl, fileName } = req.body;
    const studentId = req.userId;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    // Verify membership: student must be in the group of this assignment
    const isMember = await GroupMember.findOne({ where: { groupId: assignment.groupId, userId: studentId } });
    if (!isMember) {
      return res.status(403).json({ error: 'Truy cập bị từ chối: Bạn không phải thành viên của nhóm học tập này.' });
    }

    if (new Date() > new Date(assignment.deadline)) {
      return res.status(400).json({ message: 'Quá hạn nộp bài' });
    }

    const submission = await Submission.upsert({
      assignmentId,
      studentId,
      fileUrl,
      fileName,
      submittedAt: new Date()
    });

    res.json(submission);
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.gradeSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { grade, feedback } = req.body;
    const teacherId = req.userId;

    const submission = await Submission.findByPk(submissionId, {
      include: [{ model: Assignment }]
    });

    if (!submission) return res.status(404).json({ message: 'Submission not found' });
    if (submission.Assignment.teacherId !== teacherId) {
      return res.status(403).json({ message: 'Chỉ giảng viên giao bài mới có quyền chấm điểm' });
    }

    submission.grade = grade;
    submission.feedback = feedback;
    await submission.save();

    res.json(submission);
  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
