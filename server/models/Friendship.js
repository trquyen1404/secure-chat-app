const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Friendship = sequelize.define('Friendship', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  requesterId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  receiverId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted'),
    defaultValue: 'pending',
  },
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['requesterId', 'receiverId']
    }
  ]
});

// Define associations here to avoid circular dependency issues
// if we define them in User.js.
User.hasMany(Friendship, { foreignKey: 'requesterId', as: 'SentFriendRequests' });
User.hasMany(Friendship, { foreignKey: 'receiverId', as: 'ReceivedFriendRequests' });

Friendship.belongsTo(User, { foreignKey: 'requesterId', as: 'Requester' });
Friendship.belongsTo(User, { foreignKey: 'receiverId', as: 'Receiver' });

module.exports = Friendship;
