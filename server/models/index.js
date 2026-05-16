const sequelize = require('../config/database');
const User = require('./User');
const Message = require('./Message');
const Group = require('./Group');
const GroupMember = require('./GroupMember');
const PreKey = require('./PreKey');
const GroupMessage = require('./GroupMessage');
const Block = require('./Block');
const Friend = require('./Friend');

const db = {
  sequelize,
  User,
  Message,
  Group,
  GroupMember,
  PreKey,
  GroupMessage,
  Block,
  AttendanceSession: require('./AttendanceSession'),
  AttendanceRecord: require('./AttendanceRecord'),
  PushSubscription: require('./PushSubscription'),
  Assignment: require('./Assignment'),
  Submission: require('./Submission'),
  Poll: require('./Poll'),
  PollOption: require('./PollOption'),
  PollVote: require('./PollVote'),
  Resource: require('./Resource'),
  Schedule: require('./Schedule'),
  Announcement: require('./Announcement'),
  Note: require('./Note'),
  StudyPost: require('./StudyPost'),
  Grade: require('./Grade'),
  FlashcardSet: require('./FlashcardSet'),
  Flashcard: require('./Flashcard'),
  Exam: require('./Exam'),
  Question: require('./Question'),
  MarketListing: require('./MarketListing'),
  Confession: require('./Confession'),
  LostItem: require('./LostItem'),
  JobPosting: require('./JobPosting'),
  Club: require('./Club'),
  ...require('./AcademicCampusModels'),
  ...require('./SocialUtilityModels'),
  ...require('./UltimateModels'),
  ...require('./OmegaModels'),
  ...require('./GodModeModels'),
  Friend
};

// Establish associations
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;
