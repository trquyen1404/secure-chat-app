const { Announcement, Note, StudyPost, Grade, User, GroupMember } = require('../models');

// --- ANNOUNCEMENTS ---
exports.createAnnouncement = async (req, res) => {
  try {
    const { groupId, title, content, isUrgent } = req.body;
    const ann = await Announcement.create({ groupId, userId: req.userId, title, content, isUrgent });
    res.status(201).json(ann);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
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
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// --- NOTES ---
exports.getGroupNotes = async (req, res) => {
  try {
    const { groupId } = req.params;
    const notes = await Note.findAll({ where: { groupId }, order: [['updatedAt', 'DESC']] });
    res.json(notes);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

exports.saveNote = async (req, res) => {
  try {
    const { groupId, title, content, id } = req.body;
    let note;
    if (id) {
      note = await Note.findByPk(id);
      if (note) {
        note.title = title;
        note.content = content;
        note.lastEditorId = req.userId;
        await note.save();
      }
    } else {
      note = await Note.create({ groupId, title, content, lastEditorId: req.userId });
    }
    res.json(note);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// --- STUDY PARTNERS ---
exports.createStudyPost = async (req, res) => {
  try {
    const { subject, description } = req.body;
    const post = await StudyPost.create({ userId: req.userId, subject, description });
    res.status(201).json(post);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

exports.getStudyPosts = async (req, res) => {
  try {
    const posts = await StudyPost.findAll({ 
      include: [{ model: User, as: 'Author', attributes: ['displayName', 'username', 'avatarUrl'] }],
      order: [['createdAt', 'DESC']] 
    });
    res.json(posts);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// --- GRADEBOOK ---
exports.getGrades = async (req, res) => {
  try {
    const { groupId } = req.params;
    const grades = await Grade.findAll({ 
      where: { groupId, userId: req.userId },
      order: [['createdAt', 'DESC']]
    });
    res.json(grades);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

exports.addGrade = async (req, res) => {
  try {
    const { groupId, userId, title, score, weight } = req.body;
    const grade = await Grade.create({ groupId, userId, title, score, weight });
    res.status(201).json(grade);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};
