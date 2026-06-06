const express = require('express');
const router = express.Router();
const academicController = require('../controllers/academicController');
const auth = require('../middleware/auth');
const requireGroupMembership = require('../middleware/groupMembership');

// Announcements
router.post('/announcements', auth, requireGroupMembership, academicController.createAnnouncement);
router.get('/announcements/:groupId', auth, requireGroupMembership, academicController.getAnnouncements);

// Notes
router.get('/notes/:groupId', auth, requireGroupMembership, academicController.getGroupNotes);
router.post('/notes', auth, requireGroupMembership, academicController.saveNote);

// Study Partners
router.post('/study-posts', auth, academicController.createStudyPost);
router.get('/study-posts', auth, academicController.getStudyPosts);

// Grades
router.get('/grades/:groupId', auth, requireGroupMembership, academicController.getGrades);
router.post('/grades', auth, requireGroupMembership, academicController.addGrade);

// Flashcards
router.post('/flashcards', auth, requireGroupMembership, academicController.createFlashcardSet);
router.get('/flashcards/:groupId', auth, requireGroupMembership, academicController.getFlashcardSets);

// Exams
router.post('/exams', auth, requireGroupMembership, academicController.createExam);
router.get('/exams/:groupId', auth, requireGroupMembership, academicController.getExams);

// Gamification
router.get('/leaderboard', auth, academicController.getLeaderboard);

// Marketplace
router.post('/marketplace', auth, academicController.createListing);
router.get('/marketplace', auth, academicController.getListings);

// Confessions
router.post('/confessions', auth, requireGroupMembership, academicController.createConfession);
router.get('/confessions/:groupId', auth, requireGroupMembership, academicController.getConfessions);

// Lost & Found
router.post('/lost-found', auth, academicController.createLostItem);
router.get('/lost-found', auth, academicController.getLostItems);

// Jobs
router.get('/jobs', auth, academicController.getJobs);

// Clubs
router.get('/clubs', auth, academicController.getClubs);

module.exports = router;
