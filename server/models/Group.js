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
}, {
  timestamps: true,
});

Group.associate = (models) => {
  Group.hasMany(models.GroupMember, { foreignKey: 'groupId', as: 'Members' });
  Group.belongsToMany(models.User, { through: models.GroupMember, foreignKey: 'groupId', otherKey: 'userId', as: 'Users' });
  Group.hasMany(models.GroupMessage, { foreignKey: 'groupId', as: 'Messages' });
};

module.exports = Group;
