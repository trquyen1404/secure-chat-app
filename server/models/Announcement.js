const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Announcement = sequelize.define('Announcement', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  isUrgent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  readBy: {
    type: DataTypes.JSONB,
    defaultValue: [], // Array of user IDs who read it
  }
}, {
  timestamps: true,
});

Announcement.associate = (models) => {
  Announcement.belongsTo(models.Group, { foreignKey: 'groupId' });
  Announcement.belongsTo(models.User, { foreignKey: 'userId', as: 'Author' });
};

module.exports = Announcement;
