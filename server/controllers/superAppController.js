const { 
  TutorRequest, CourseReview, Project, CanteenOrder, LibraryBooking,
  Election, EventTicket, Expense, DiaryEntry, 
  GymBooking, TuitionRecord, GreenPoint, BloodDonation,
  ResumeProfile, InternshipJournal, GroupBuy, VaultFile, SecretSantaSession,
  UserWallet, Accommodation, MealListing, Campaign,
  User 
} = require('../models');

// Generic CRUD helper with pagination safety
const handleRequest = async (model, req, res, action = 'findAll', options = {}) => {
  try {
    const queryOptions = { ...options };
    if (action === 'findAll') {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const offset = (page - 1) * limit;
      queryOptions.limit = limit;
      queryOptions.offset = offset;
    }
    const result = await model[action](queryOptions);
    res.json(result);
  } catch (error) { 
    console.error(`[handleRequest] Error for action ${action}:`, error);
    res.status(500).json({ message: 'Error' }); 
  }
};

// --- ACADEMIC ---
exports.getTutors = (req, res) => handleRequest(TutorRequest, req, res, 'findAll', { include: [User] });
exports.createTutor = async (req, res) => {
  try {
    const { subject, description } = req.body;
    const item = await TutorRequest.create({ 
      subject, 
      description, 
      userId: req.userId,
      status: 'open'
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getReviews = (req, res) => handleRequest(CourseReview, req, res);
exports.createReview = async (req, res) => {
  try {
    const { courseName, lecturerName, rating, content } = req.body;
    const item = await CourseReview.create({ 
      courseName, 
      lecturerName, 
      rating, 
      content, 
      userId: req.userId 
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
};

// --- CAMPUS ---
exports.getCanteenOrders = (req, res) => handleRequest(CanteenOrder, req, res, 'findAll', { where: { userId: req.userId } });
exports.createCanteenOrder = async (req, res) => {
  try {
    const { items, totalPrice } = req.body;
    const item = await CanteenOrder.create({ 
      items, 
      totalPrice, 
      status: 'pending',
      userId: req.userId 
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getLibraryBookings = (req, res) => handleRequest(LibraryBooking, req, res, 'findAll', { where: { userId: req.userId } });
exports.createLibraryBooking = async (req, res) => {
  try {
    const { seatNumber, startTime, endTime } = req.body;
    const item = await LibraryBooking.create({ 
      seatNumber, 
      startTime, 
      endTime, 
      userId: req.userId 
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
};

// --- SOCIAL ---
exports.getElections = (req, res) => handleRequest(Election, req, res);
exports.voteElection = async (req, res) => {
  const { id, candidateId } = req.body;
  const { sequelize } = require('../models');
  const t = await sequelize.transaction();
  try {
    const election = await Election.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!election) {
      await t.rollback();
      return res.status(400).json({ message: 'Already voted' });
    }
    if (election.voterIds.includes(req.userId)) {
      await t.rollback();
      return res.status(400).json({ message: 'Already voted' });
    }

    election.voterIds = [...election.voterIds, req.userId];
    election.candidates = election.candidates.map(c => c.id === candidateId ? { ...c, votes: (c.votes || 0) + 1 } : c);
    
    election.changed('voterIds', true);
    election.changed('candidates', true);

    await election.save({ transaction: t });
    await t.commit();
    res.json(election);
  } catch (err) {
    await t.rollback();
    console.error('Vote election error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// --- UTILITIES ---
exports.getExpenses = (req, res) => handleRequest(Expense, req, res, 'findAll', { where: { userId: req.userId } });
exports.createExpense = async (req, res) => {
  try {
    const { title, amount, category, date } = req.body;
    const item = await Expense.create({ 
      title, 
      amount, 
      category, 
      date: date || new Date(), 
      userId: req.userId 
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getDiary = (req, res) => handleRequest(DiaryEntry, req, res, 'findAll', { where: { userId: req.userId } });
exports.createDiary = async (req, res) => {
  try {
    const { content } = req.body;
    const item = await DiaryEntry.create({ 
      content, 
      userId: req.userId 
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
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
