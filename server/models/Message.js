const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User'); // need to import User for association

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  senderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  recipientId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  encryptedContent: {
    type: DataTypes.TEXT,
    allowNull: true, // Allow true because if deleted, we might wipe it
  },
  encryptedAesKeyForSender: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  encryptedAesKeyForRecipient: {
    type: DataTypes.TEXT,
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
  iv: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  replyToId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  reactions: {
    type: DataTypes.JSONB,
    defaultValue: {},
    allowNull: false
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['senderId', 'recipientId']
    },
    {
      fields: ['recipientId', 'senderId']
    },
    {
      fields: ['createdAt']
    }
  ]
});

// Relationships
User.hasMany(Message, { as: 'SentMessages', foreignKey: 'senderId' });
User.hasMany(Message, { as: 'ReceivedMessages', foreignKey: 'recipientId' });
Message.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Message.belongsTo(User, { as: 'Recipient', foreignKey: 'recipientId' });

// Self-referencing relationship for Replies
Message.hasMany(Message, { as: 'Replies', foreignKey: 'replyToId' });
Message.belongsTo(Message, { as: 'ReplyTo', foreignKey: 'replyToId' });

module.exports = Message;
