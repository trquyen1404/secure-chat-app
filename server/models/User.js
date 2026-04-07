const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  publicKey: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  dhPublicKey: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  themeColor: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  lastSeenAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  online: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  encryptedPrivateKey: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  keyBackupSalt: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  keyBackupIv: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tokenVersion: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  vaultData: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
}, {
  timestamps: true,
});

User.associate = (models) => {
  User.hasMany(models.GroupMember, { foreignKey: 'userId', as: 'GroupMembers' });
  User.belongsToMany(models.Group, { through: models.GroupMember, foreignKey: 'userId', otherKey: 'groupId', as: 'Groups' });
  User.hasMany(models.Block, { foreignKey: 'blockerId', as: 'BlockedUsers' });
  User.hasMany(models.Block, { foreignKey: 'blockedId', as: 'Blockers' });
  
  // Previously from Message.js
  User.hasMany(models.Message, { as: 'SentMessages', foreignKey: 'senderId' });
  User.hasMany(models.Message, { as: 'ReceivedMessages', foreignKey: 'recipientId' });
  
  // Previously from PreKey.js
  User.hasMany(models.PreKey, { foreignKey: 'userId', as: 'PreKeys' });
};

module.exports = User;
