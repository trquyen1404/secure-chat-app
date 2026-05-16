const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PollVote = sequelize.define('PollVote', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  pollId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  optionId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  }
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['pollId', 'userId', 'optionId'] // To handle multiple choice if allowed, otherwise we check logic in controller
    }
  ]
});

PollVote.associate = (models) => {
  PollVote.belongsTo(models.Poll, { foreignKey: 'pollId' });
  PollVote.belongsTo(models.PollOption, { foreignKey: 'optionId' });
  PollVote.belongsTo(models.User, { foreignKey: 'userId' });
};

module.exports = PollVote;
