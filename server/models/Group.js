const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  themeColor: {
    type: DataTypes.STRING,
    defaultValue: '#0084ff',
  },
  quickEmoji: {
    type: DataTypes.STRING,
    defaultValue: '👍',
  },
  selfDestructTimer: {
    type: DataTypes.INTEGER,
    defaultValue: 0, // 0 = disabled, else seconds
  },
  inviteCode: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  isMuted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  timestamps: true,
});

Group.associate = (models) => {
  Group.hasMany(models.GroupMember, { foreignKey: 'groupId', as: 'Members', onDelete: 'CASCADE' });
  Group.belongsToMany(models.User, { through: models.GroupMember, foreignKey: 'groupId', otherKey: 'userId', as: 'Users', onDelete: 'CASCADE' });
  Group.hasMany(models.GroupMessage, { foreignKey: 'groupId', as: 'Messages', onDelete: 'CASCADE' });
  Group.hasMany(models.Poll, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Group.hasMany(models.Assignment, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Group.hasMany(models.Note, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Group.hasMany(models.Resource, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Group.hasMany(models.AttendanceSession, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Group.hasMany(models.Announcement, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Group.hasMany(models.Grade, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Group.hasMany(models.FlashcardSet, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Group.hasMany(models.Exam, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Group.hasMany(models.Confession, { foreignKey: 'groupId', onDelete: 'CASCADE' });
};

module.exports = Group;
