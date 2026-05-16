const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PollOption = sequelize.define('PollOption', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  pollId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  text: {
    type: DataTypes.STRING,
    allowNull: false,
  }
}, {
  timestamps: false,
});

PollOption.associate = (models) => {
  PollOption.belongsTo(models.Poll, { foreignKey: 'pollId' });
  PollOption.hasMany(models.PollVote, { foreignKey: 'optionId', as: 'Votes' });
};

module.exports = PollOption;
