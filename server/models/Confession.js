const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Confession = sequelize.define('Confession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  isApproved: {
    type: DataTypes.BOOLEAN,
    defaultValue: true, // Defaulting to true for simplicity in this project
  }
}, {
  timestamps: true,
});

Confession.associate = (models) => {
  Confession.belongsTo(models.Group, { foreignKey: 'groupId' });
};

module.exports = Confession;
