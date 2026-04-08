const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const PinnedChat = sequelize.define('PinnedChat', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  targetUserId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  }
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'targetUserId']
    }
  ]
});

// Associations
User.hasMany(PinnedChat, { foreignKey: 'userId', as: 'Pins' });
PinnedChat.belongsTo(User, { foreignKey: 'userId', as: 'User' });
PinnedChat.belongsTo(User, { foreignKey: 'targetUserId', as: 'TargetUser' });

module.exports = PinnedChat;
