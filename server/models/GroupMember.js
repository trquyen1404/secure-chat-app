const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GroupMember = sequelize.define('GroupMember', {
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
  role: {
    type: DataTypes.STRING,
    defaultValue: 'member',
  },
  lastReadMessageId: {
    type: DataTypes.UUID,
    allowNull: true,
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

GroupMember.associate = (models) => {
  GroupMember.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
  GroupMember.belongsTo(models.Group, { foreignKey: 'groupId', as: 'Group' });
};

module.exports = GroupMember;
