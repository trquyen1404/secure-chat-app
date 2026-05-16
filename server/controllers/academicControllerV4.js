const { LostItem, JobPosting, Club, User } = require('../models');

// --- LOST & FOUND ---
exports.createLostItem = async (req, res) => {
  try {
    const item = await LostItem.create({ ...req.body, userId: req.userId });
    res.status(201).json(item);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

exports.getLostItems = async (req, res) => {
  try {
    const items = await LostItem.findAll({ 
      include: [{ model: User, as: 'Reporter', attributes: ['displayName', 'username'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(items);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// --- JOBS ---
exports.getJobs = async (req, res) => {
  try {
    const jobs = await JobPosting.findAll({ order: [['createdAt', 'DESC']] });
    res.json(jobs);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// --- CLUBS ---
exports.getClubs = async (req, res) => {
  try {
    const clubs = await Club.findAll({ order: [['memberCount', 'DESC']] });
    res.json(clubs);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};
