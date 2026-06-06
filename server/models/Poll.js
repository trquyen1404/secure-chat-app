const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Poll = sequelize.define('Poll', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  creatorId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  question: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  isMultipleChoice: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  isAnonymous: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'open', // 'open', 'closed'
  }
}, {
  timestamps: true,
});

Poll.associate = (models) => {
  Poll.belongsTo(models.Group, { foreignKey: 'groupId' });
  Poll.belongsTo(models.User, { foreignKey: 'creatorId', as: 'Creator' });
  Poll.hasMany(models.PollOption, { foreignKey: 'pollId', as: 'Options', onDelete: 'CASCADE' });
  Poll.hasMany(models.PollVote, { foreignKey: 'pollId', as: 'Votes', onDelete: 'CASCADE' });
};

module.exports = Poll;
