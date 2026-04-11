const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  senderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  recipientId: {
    type: DataTypes.UUID,
    allowNull: false,
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
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'text',
  },
  localId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    { fields: ['senderId', 'recipientId'] },
    { fields: ['recipientId', 'senderId'] },
    { fields: ['createdAt'] }
  ]
});

Message.associate = (models) => {
  Message.belongsTo(models.User, { as: 'Sender', foreignKey: 'senderId' });
  Message.belongsTo(models.User, { as: 'Recipient', foreignKey: 'recipientId' });
  Message.hasMany(models.Message, { as: 'Replies', foreignKey: 'replyToId' });
  Message.belongsTo(models.Message, { as: 'ReplyTo', foreignKey: 'replyToId' });
};

module.exports = Message;
