const sequelize = require('../config/database');
const User = require('./User');
const Message = require('./Message');
const Group = require('./Group');
const GroupMember = require('./GroupMember');
const PreKey = require('./PreKey');
const GroupMessage = require('./GroupMessage');
const Block = require('./Block');

const db = {
  sequelize,
  User,
  Message,
  Group,
  GroupMember,
  PreKey,
  GroupMessage,
  Block
};

// Establish associations
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;
