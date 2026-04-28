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
  },
  senderId: {
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
  iv: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  signature: {
    type: DataTypes.TEXT,
    allowNull: true,  // [Fix] ECDSA signature over ciphertext+IV+AD for group message integrity
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
    {
      fields: ['groupId']
    },
    {
      fields: ['createdAt']
    }
  ]
});

GroupMessage.associate = (models) => {
  GroupMessage.belongsTo(models.Group, { foreignKey: 'groupId', as: 'Group' });
  GroupMessage.belongsTo(models.User, { foreignKey: 'senderId', as: 'Sender' });
  GroupMessage.hasMany(models.GroupMessage, { as: 'Replies', foreignKey: 'replyToId' });
  GroupMessage.belongsTo(models.GroupMessage, { as: 'ReplyTo', foreignKey: 'replyToId' });
};

module.exports = GroupMessage;
