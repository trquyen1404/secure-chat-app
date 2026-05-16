const { MarketListing, Confession, User } = require('../models');

// --- MARKETPLACE ---
exports.createListing = async (req, res) => {
  try {
    const { title, price, type, subject, imageUrl } = req.body;
    const listing = await MarketListing.create({ 
      userId: req.userId, title, price, type, subject, imageUrl 
    });
    res.status(201).json(listing);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

exports.getListings = async (req, res) => {
  try {
    const listings = await MarketListing.findAll({ 
      where: { status: 'active' },
      include: [{ model: User, as: 'Seller', attributes: ['displayName', 'username', 'avatarUrl'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(listings);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

// --- CONFESSIONS ---
exports.createConfession = async (req, res) => {
  try {
    const { groupId, content } = req.body;
    const confession = await Confession.create({ groupId, content });
    res.status(201).json(confession);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};

exports.getConfessions = async (req, res) => {
  try {
    const { groupId } = req.params;
    const confessions = await Confession.findAll({ 
      where: { groupId },
      order: [['createdAt', 'DESC']]
    });
    res.json(confessions);
  } catch (error) { res.status(500).json({ message: 'Error' }); }
};
