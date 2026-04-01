const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GroupMessage = sequelize.define('GroupMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Groups',
      key: 'id',
    },
  },
  senderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  encryptedContent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  encryptedAesKeyForSender: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  encryptedAesKeyForRecipient: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  iv: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  replyToId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  reactions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    allowNull: false,
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  editedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  editedBy: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['groupId']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = GroupMessage;
