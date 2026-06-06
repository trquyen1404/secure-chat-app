const { Poll, PollOption, PollVote, User, GroupMember } = require('../models');
const notificationService = require('../services/notificationService');

exports.createPoll = async (req, res) => {
  try {
    const { groupId, question, options, isMultipleChoice, isAnonymous, expiresAt } = req.body;
    const creatorId = req.userId;

    const poll = await Poll.create({
      groupId,
      creatorId,
      question,
      isMultipleChoice,
      isAnonymous,
      expiresAt
    });

    const optionData = options.map(text => ({ pollId: poll.id, text }));
    await PollOption.bulkCreate(optionData);

    const fullPoll = await Poll.findByPk(poll.id, {
      include: [{ model: PollOption, as: 'Options' }]
    });

    // Notify group
    notificationService.sendGroupNotification(groupId, {
      title: '📊 Khảo sát lớp học',
      body: `Bình chọn mới: ${question}`,
      url: `/`,
      tag: `poll-${poll.id}`
    }, creatorId);

    // Notify group via socket (handled by the caller or middleware in a real app, 
    // but here we just return it and let the client emit a special message type)
    res.status(201).json(fullPoll);
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getGroupPolls = async (req, res) => {
  try {
    const { groupId } = req.params;
    const polls = await Poll.findAll({
      where: { groupId },
      include: [
        { model: PollOption, as: 'Options', include: [{ model: PollVote, as: 'Votes' }] },
        { model: PollVote, as: 'Votes' }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(polls);
  } catch (error) {
    console.error('Get polls error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.vote = async (req, res) => {
  try {
    const { pollId, optionId } = req.body;
    const userId = req.userId;

    const poll = await Poll.findByPk(pollId);
    if (!poll) return res.status(404).json({ message: 'Poll not found' });
    if (poll.status === 'closed') return res.status(400).json({ message: 'Poll is closed' });

    // Verify membership: voter must be in the group of this poll
    const isMember = await GroupMember.findOne({ where: { groupId: poll.groupId, userId } });
    if (!isMember) {
      return res.status(403).json({ error: 'Truy cập bị từ chối: Bạn không phải thành viên của nhóm học tập này.' });
    }

    if (!poll.isMultipleChoice) {
      // Delete previous votes by this user for this poll
      await PollVote.destroy({ where: { pollId, userId } });
    } else {
      // For multiple choice, ensure this user hasn't voted for this specific option yet
      const existingVote = await PollVote.findOne({ where: { pollId, optionId, userId } });
      if (existingVote) {
        return res.status(400).json({ error: 'Bạn đã bình chọn cho phương án này rồi.' });
      }
    }

    await PollVote.create({ pollId, optionId, userId });

    const updatedPoll = await Poll.findByPk(pollId, {
      include: [
        { model: PollOption, as: 'Options', include: [{ model: PollVote, as: 'Votes' }] },
        { model: PollVote, as: 'Votes' }
      ]
    });

    res.json(updatedPoll);
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
