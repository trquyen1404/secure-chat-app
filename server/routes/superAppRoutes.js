const express = require('express');
const router = express.Router();
const superAppController = require('../controllers/superAppController');
const auth = require('../middleware/auth');

router.get('/tutors', auth, superAppController.getTutors);
router.post('/tutors', auth, superAppController.createTutor);

router.get('/reviews', auth, superAppController.getReviews);
router.post('/reviews', auth, superAppController.createReview);

router.get('/canteen', auth, superAppController.getCanteenOrders);
router.post('/canteen', auth, superAppController.createCanteenOrder);

router.get('/library', auth, superAppController.getLibraryBookings);
router.post('/library', auth, superAppController.createLibraryBooking);

router.get('/elections', auth, superAppController.getElections);
router.post('/elections/vote', auth, superAppController.voteElection);

router.get('/expenses', auth, superAppController.getExpenses);
router.post('/expenses', auth, superAppController.createExpense);

router.get('/diary', auth, superAppController.getDiary);
router.post('/diary', auth, superAppController.createDiary);

router.get('/gym', auth, superAppController.getGymBookings);
router.get('/tuition', auth, superAppController.getTuition);
router.get('/green-points', auth, superAppController.getGreenPoints);
router.get('/blood-donations', auth, superAppController.getBloodDonations);

router.get('/resume', auth, superAppController.getResume);
router.get('/internship', auth, superAppController.getInternship);
router.get('/group-buys', auth, superAppController.getGroupBuys);
router.get('/vault', auth, superAppController.getVault);
router.get('/secret-santa', auth, superAppController.getSecretSanta);

router.get('/wallet', auth, superAppController.getWallet);
router.get('/accommodations', auth, superAppController.getAccommodations);
router.get('/meals', auth, superAppController.getMeals);
router.get('/campaigns', auth, superAppController.getCampaigns);

module.exports = router;
