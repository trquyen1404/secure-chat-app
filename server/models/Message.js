const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  senderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: User, key: 'id' }
  },
  recipientId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: User, key: 'id' }
  },
  encryptedContent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ratchetKey: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  n: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  pn: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  senderEk: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  usedOpk: {
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
  expiresInSeconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['senderId', 'recipientId'] },
    { fields: ['recipientId', 'senderId'] },
    { fields: ['createdAt'] }
  ]
});

User.hasMany(Message, { as: 'SentMessages', foreignKey: 'senderId' });
User.hasMany(Message, { as: 'ReceivedMessages', foreignKey: 'recipientId' });
Message.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Message.belongsTo(User, { as: 'Recipient', foreignKey: 'recipientId' });
Message.hasMany(Message, { as: 'Replies', foreignKey: 'replyToId' });
Message.belongsTo(Message, { as: 'ReplyTo', foreignKey: 'replyToId' });

module.exports = Message;
