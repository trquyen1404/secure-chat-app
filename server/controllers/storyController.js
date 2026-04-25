const Story = require('../models/Story');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { Op } = require('sequelize');

exports.createStory = async (req, res) => {
  try {
    const { content, mediaUrl, mediaType } = req.body;
    const story = await Story.create({
      userId: req.userId,
      content,
      mediaUrl,
      mediaType: mediaType || 'text'
    });
    res.status(201).json(story);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create story' });
  }
};

exports.getStories = async (req, res) => {
  try {
    // 24 hours ago
    const yesterday = new Date(new Date() - 24 * 60 * 60 * 1000);

    // Get stories from myself to always show
    // Get stories from my friends
    const friendsAsReceiver = await Friendship.findAll({ where: { receiverId: req.userId, status: 'accepted' }});
    const friendsAsRequester = await Friendship.findAll({ where: { requesterId: req.userId, status: 'accepted' }});
    
    let friendIds = [
      ...friendsAsReceiver.map(f => f.requesterId),
      ...friendsAsRequester.map(f => f.receiverId)
    ];
    // Include my own ID to see my own stories
    friendIds.push(req.userId);

    const stories = await Story.findAll({
      where: {
        userId: { [Op.in]: friendIds },
        createdAt: { [Op.gte]: yesterday }
      },
      include: [{
        model: User,
        as: 'Author',
        attributes: ['id', 'username', 'avatarUrl']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json(stories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
};
