const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Group = require('./Group');

const GroupMember = sequelize.define('GroupMember', {
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
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: 'member',
  },
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['groupId', 'userId']
    }
  ]
});

module.exports = GroupMember;
