const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Grade = sequelize.define('Grade', {
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
  assignmentId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  score: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  weight: {
    type: DataTypes.FLOAT, // e.g. 0.1 for 10%
    defaultValue: 1.0,
  }
}, {
  timestamps: true,
});

Grade.associate = (models) => {
  Grade.belongsTo(models.Group, { foreignKey: 'groupId' });
  Grade.belongsTo(models.User, { foreignKey: 'userId' });
  Grade.belongsTo(models.Assignment, { foreignKey: 'assignmentId', as: 'Assignment' });
};

module.exports = Grade;
