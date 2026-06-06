const {
  Announcement, Note, StudyPost, Grade, User,
  FlashcardSet, Flashcard, Exam, Question,
  MarketListing, Confession,
  LostItem, JobPosting, Club, GroupMember
} = require('../models');

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────────────────

exports.createAnnouncement = async (req, res) => {
  try {
    const { groupId, title, content, isUrgent } = req.body;

    // Check permissions: creator must be a teacher OR group admin
    const member = await GroupMember.findOne({ where: { groupId, userId: req.userId } });
    if (!member || (member.role !== 'admin' && req.user.role !== 'teacher')) {
      return res.status(403).json({ error: 'Chỉ giảng viên hoặc quản trị viên nhóm mới có quyền thực hiện hành động này.' });
    }

    const ann = await Announcement.create({ groupId, userId: req.userId, title, content, isUrgent });
    res.status(201).json(ann);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getAnnouncements = async (req, res) => {
  try {
    const { groupId } = req.params;
    const anns = await Announcement.findAll({
      where: { groupId },
      include: [{ model: User, as: 'Author', attributes: ['displayName', 'username'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(anns);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── NOTES ─────────────────────────────────────────────────────────────────────

exports.getGroupNotes = async (req, res) => {
  try {
    const { groupId } = req.params;
    const notes = await Note.findAll({ where: { groupId }, order: [['updatedAt', 'DESC']] });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.saveNote = async (req, res) => {
  try {
    const { groupId, title, content, id } = req.body;
    let note;
    if (id) {
      note = await Note.findOne({ where: { id, groupId } });
      if (!note) {
        return res.status(404).json({ error: 'Ghi chú không tồn tại hoặc không thuộc nhóm này' });
      }
      note.title = title;
      note.content = content;
      note.lastEditorId = req.userId;
      await note.save();
    } else {
      note = await Note.create({ groupId, title, content, lastEditorId: req.userId });
    }
    res.json(note);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── STUDY PARTNERS ────────────────────────────────────────────────────────────

exports.createStudyPost = async (req, res) => {
  try {
    const { subject, description } = req.body;
    const post = await StudyPost.create({ userId: req.userId, subject, description });
    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getStudyPosts = async (req, res) => {
  try {
    const posts = await StudyPost.findAll({
      include: [{ model: User, as: 'Author', attributes: ['displayName', 'username', 'avatarUrl'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── GRADEBOOK ─────────────────────────────────────────────────────────────────

exports.getGrades = async (req, res) => {
  try {
    const { groupId } = req.params;
    const grades = await Grade.findAll({
      where: { groupId, userId: req.userId },
      order: [['createdAt', 'DESC']]
    });
    res.json(grades);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.addGrade = async (req, res) => {
  try {
    const { groupId, userId, title, score, weight } = req.body;

    // Check permissions: creator must be a teacher OR group admin
    const member = await GroupMember.findOne({ where: { groupId, userId: req.userId } });
    if (!member || (member.role !== 'admin' && req.user.role !== 'teacher')) {
      return res.status(403).json({ error: 'Chỉ giảng viên hoặc quản trị viên nhóm mới có quyền thực hiện hành động này.' });
    }

    const grade = await Grade.create({ groupId, userId, title, score, weight });
    res.status(201).json(grade);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── FLASHCARDS ────────────────────────────────────────────────────────────────

exports.createFlashcardSet = async (req, res) => {
  try {
    const { groupId, title, description, cards } = req.body;
    const set = await FlashcardSet.create({ groupId, userId: req.userId, title, description });
    if (cards && cards.length > 0) {
      await Flashcard.bulkCreate(cards.map(c => ({
        front: c.front,
        back: c.back,
        setId: set.id
      })));
    }
    res.status(201).json(set);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getFlashcardSets = async (req, res) => {
  try {
    const { groupId } = req.params;
    const sets = await FlashcardSet.findAll({
      where: { groupId },
      include: [{ model: Flashcard, as: 'Cards' }]
    });
    res.json(sets);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── EXAMS ─────────────────────────────────────────────────────────────────────

exports.createExam = async (req, res) => {
  try {
    const { groupId, title, durationMinutes, questions } = req.body;

    // Check permissions: creator must be a teacher OR group admin
    const member = await GroupMember.findOne({ where: { groupId, userId: req.userId } });
    if (!member || (member.role !== 'admin' && req.user.role !== 'teacher')) {
      return res.status(403).json({ error: 'Chỉ giảng viên hoặc quản trị viên nhóm mới có quyền thực hiện hành động này.' });
    }

    const exam = await Exam.create({ groupId, creatorId: req.userId, title, durationMinutes });
    if (questions && questions.length > 0) {
      await Question.bulkCreate(questions.map(q => ({
        text: q.text,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        examId: exam.id
      })));
    }
    res.status(201).json(exam);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getExams = async (req, res) => {
  try {
    const { groupId } = req.params;
    const exams = await Exam.findAll({
      where: { groupId },
      include: [{ model: Question, as: 'Questions' }]
    });
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── GAMIFICATION ──────────────────────────────────────────────────────────────

exports.getLeaderboard = async (req, res) => {
  try {
    const topUsers = await User.findAll({
      attributes: ['id', 'displayName', 'username', 'avatarUrl', 'points', 'badges'],
      order: [['points', 'DESC']],
      limit: 10
    });
    res.json(topUsers);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── MARKETPLACE ───────────────────────────────────────────────────────────────

exports.createListing = async (req, res) => {
  try {
    const { title, price, type, subject, imageUrl } = req.body;
    const listing = await MarketListing.create({
      userId: req.userId, title, price, type, subject, imageUrl
    });
    res.status(201).json(listing);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getListings = async (req, res) => {
  try {
    const listings = await MarketListing.findAll({
      where: { status: 'active' },
      include: [{ model: User, as: 'Seller', attributes: ['displayName', 'username', 'avatarUrl'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── CONFESSIONS ───────────────────────────────────────────────────────────────

exports.createConfession = async (req, res) => {
  try {
    const { groupId, content } = req.body;
    const confession = await Confession.create({ groupId, content });
    res.status(201).json(confession);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getConfessions = async (req, res) => {
  try {
    const { groupId } = req.params;
    const confessions = await Confession.findAll({
      where: { groupId },
      order: [['createdAt', 'DESC']]
    });
    res.json(confessions);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── LOST & FOUND ──────────────────────────────────────────────────────────────

exports.createLostItem = async (req, res) => {
  try {
    const { title, description, location, type, imageUrl } = req.body;
    const item = await LostItem.create({
      title,
      description,
      location,
      type,
      imageUrl,
      userId: req.userId
    });
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

exports.getLostItems = async (req, res) => {
  try {
    const items = await LostItem.findAll({
      include: [{ model: User, as: 'Reporter', attributes: ['displayName', 'username'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── JOBS ──────────────────────────────────────────────────────────────────────

exports.getJobs = async (req, res) => {
  try {
    const jobs = await JobPosting.findAll({ order: [['createdAt', 'DESC']] });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};

// ── CLUBS ─────────────────────────────────────────────────────────────────────

exports.getClubs = async (req, res) => {
  try {
    const clubs = await Club.findAll({ order: [['memberCount', 'DESC']] });
    res.json(clubs);
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};
