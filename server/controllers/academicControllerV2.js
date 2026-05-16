const { FlashcardSet, Flashcard, Exam, Question, User } = require('../models');

// --- FLASHCARDS ---
exports.createFlashcardSet = async (req, res) => {
  try {
    const { groupId, title, description, cards } = req.body;
    const set = await FlashcardSet.create({ groupId, userId: req.userId, title, description });
    if (cards && cards.length > 0) {
      await Flashcard.bulkCreate(cards.map(c => ({ ...c, setId: set.id })));
    }
    res.status(201).json(set);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

exports.getFlashcardSets = async (req, res) => {
  try {
    const { groupId } = req.params;
    const sets = await FlashcardSet.findAll({ 
      where: { groupId }, 
      include: [{ model: Flashcard, as: 'Cards' }] 
    });
    res.json(sets);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// --- EXAMS ---
exports.createExam = async (req, res) => {
  try {
    const { groupId, title, durationMinutes, questions } = req.body;
    const exam = await Exam.create({ groupId, creatorId: req.userId, title, durationMinutes });
    if (questions && questions.length > 0) {
      await Question.bulkCreate(questions.map(q => ({ ...q, examId: exam.id })));
    }
    res.status(201).json(exam);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

exports.getExams = async (req, res) => {
  try {
    const { groupId } = req.params;
    const exams = await Exam.findAll({ 
      where: { groupId }, 
      include: [{ model: Question, as: 'Questions' }] 
    });
    res.json(exams);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// --- GAMIFICATION ---
exports.getLeaderboard = async (req, res) => {
  try {
    const topUsers = await User.findAll({
      attributes: ['id', 'displayName', 'username', 'avatarUrl', 'points', 'badges'],
      order: [['points', 'DESC']],
      limit: 10
    });
    res.json(topUsers);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};
