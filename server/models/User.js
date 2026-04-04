const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Group = require('./Group');
const GroupMember = require('./GroupMember');


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
  fullName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  profilePrivacy: {
    type: DataTypes.ENUM('public', 'friends', 'private'),
    defaultValue: 'public',
  },
  webPushSubscription: {
    type: DataTypes.JSONB,
    allowNull: true,
  }
}, {
  timestamps: true,
});

User.hasMany(GroupMember, { foreignKey: 'userId', as: 'GroupMembers' });
User.belongsToMany(Group, { through: GroupMember, foreignKey: 'userId', otherKey: 'groupId', as: 'Groups' });

module.exports = User;
