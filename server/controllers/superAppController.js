const { 
  TutorRequest, CourseReview, Project, CanteenOrder, LibraryBooking,
  Election, EventTicket, Expense, DiaryEntry, 
  GymBooking, TuitionRecord, GreenPoint, BloodDonation,
  ResumeProfile, InternshipJournal, GroupBuy, VaultFile, SecretSantaSession,
  UserWallet, Accommodation, MealListing, Campaign,
  User 
} = require('../models');

// Generic CRUD helper
const handleRequest = async (model, req, res, action = 'findAll', options = {}) => {
  try {
    const result = await model[action](options);
    res.json(result);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// --- ACADEMIC ---
exports.getTutors = (req, res) => handleRequest(TutorRequest, req, res, 'findAll', { include: [User] });
exports.createTutor = async (req, res) => {
  const item = await TutorRequest.create({ ...req.body, userId: req.userId });
  res.status(201).json(item);
};

exports.getReviews = (req, res) => handleRequest(CourseReview, req, res);
exports.createReview = async (req, res) => {
  const item = await CourseReview.create({ ...req.body, userId: req.userId });
  res.status(201).json(item);
};

// --- CAMPUS ---
exports.getCanteenOrders = (req, res) => handleRequest(CanteenOrder, req, res, 'findAll', { where: { userId: req.userId } });
exports.createCanteenOrder = async (req, res) => {
  const item = await CanteenOrder.create({ ...req.body, userId: req.userId });
  res.status(201).json(item);
};

exports.getLibraryBookings = (req, res) => handleRequest(LibraryBooking, req, res, 'findAll', { where: { userId: req.userId } });
exports.createLibraryBooking = async (req, res) => {
  const item = await LibraryBooking.create({ ...req.body, userId: req.userId });
  res.status(201).json(item);
};

// --- SOCIAL ---
exports.getElections = (req, res) => handleRequest(Election, req, res);
exports.voteElection = async (req, res) => {
  const { id, candidateId } = req.body;
  const election = await Election.findByPk(id);
  if (election && !election.voterIds.includes(req.userId)) {
    election.voterIds = [...election.voterIds, req.userId];
    election.candidates = election.candidates.map(c => c.id === candidateId ? { ...c, votes: c.votes + 1 } : c);
    await election.save();
    return res.json(election);
  }
  res.status(400).json({ message: 'Already voted' });
};

// --- UTILITIES ---
exports.getExpenses = (req, res) => handleRequest(Expense, req, res, 'findAll', { where: { userId: req.userId } });
exports.createExpense = async (req, res) => {
  const item = await Expense.create({ ...req.body, userId: req.userId });
  res.status(201).json(item);
};

exports.getDiary = (req, res) => handleRequest(DiaryEntry, req, res, 'findAll', { where: { userId: req.userId } });
exports.createDiary = async (req, res) => {
  const item = await DiaryEntry.create({ ...req.body, userId: req.userId });
  res.status(201).json(item);
};

// --- ULTIMATE ---
exports.getGymBookings = (req, res) => handleRequest(GymBooking, req, res, 'findAll', { where: { userId: req.userId } });
exports.getTuition = (req, res) => handleRequest(TuitionRecord, req, res, 'findAll', { where: { userId: req.userId } });
exports.getGreenPoints = (req, res) => handleRequest(GreenPoint, req, res, 'findAll', { where: { userId: req.userId } });
exports.getBloodDonations = (req, res) => handleRequest(BloodDonation, req, res, 'findAll', { where: { userId: req.userId } });

// --- OMEGA ---
exports.getResume = (req, res) => handleRequest(ResumeProfile, req, res, 'findOne', { where: { userId: req.userId } });
exports.getInternship = (req, res) => handleRequest(InternshipJournal, req, res, 'findAll', { where: { userId: req.userId } });
exports.getGroupBuys = (req, res) => handleRequest(GroupBuy, req, res);
exports.getVault = (req, res) => handleRequest(VaultFile, req, res, 'findAll', { where: { userId: req.userId } });
exports.getSecretSanta = (req, res) => handleRequest(SecretSantaSession, req, res, 'findAll');

// --- GOD MODE ---
exports.getWallet = (req, res) => handleRequest(UserWallet, req, res, 'findOne', { where: { userId: req.userId } });
exports.getAccommodations = (req, res) => handleRequest(Accommodation, req, res);
exports.getMeals = (req, res) => handleRequest(MealListing, req, res);
exports.getCampaigns = (req, res) => handleRequest(Campaign, req, res);
