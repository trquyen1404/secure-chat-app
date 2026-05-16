const express = require('express');
const router = express.Router();
const academicController = require('../controllers/academicController');
const academicControllerV2 = require('../controllers/academicControllerV2');
const academicControllerV3 = require('../controllers/academicControllerV3');
const academicControllerV4 = require('../controllers/academicControllerV4');
const auth = require('../middleware/auth');

// Announcements
router.post('/announcements', auth, academicController.createAnnouncement);
router.get('/announcements/:groupId', auth, academicController.getAnnouncements);

// Notes
router.get('/notes/:groupId', auth, academicController.getGroupNotes);
router.post('/notes', auth, academicController.saveNote);

// Study Partners
router.post('/study-posts', auth, academicController.createStudyPost);
router.get('/study-posts', auth, academicController.getStudyPosts);

// Grades
router.get('/grades/:groupId', auth, academicController.getGrades);
router.post('/grades', auth, academicController.addGrade);

// Flashcards
router.post('/flashcards', auth, academicControllerV2.createFlashcardSet);
router.get('/flashcards/:groupId', auth, academicControllerV2.getFlashcardSets);

// Exams
router.post('/exams', auth, academicControllerV2.createExam);
router.get('/exams/:groupId', auth, academicControllerV2.getExams);

// Gamification
router.get('/leaderboard', auth, academicControllerV2.getLeaderboard);

// Marketplace
router.post('/marketplace', auth, academicControllerV3.createListing);
router.get('/marketplace', auth, academicControllerV3.getListings);

// Confessions
router.post('/confessions', auth, academicControllerV3.createConfession);
router.get('/confessions/:groupId', auth, academicControllerV3.getConfessions);

// Lost & Found
router.post('/lost-found', auth, academicControllerV4.createLostItem);
router.get('/lost-found', auth, academicControllerV4.getLostItems);

// Jobs
router.get('/jobs', auth, academicControllerV4.getJobs);

// Clubs
router.get('/clubs', auth, academicControllerV4.getClubs);

module.exports = router;
