const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PreKey = sequelize.define('PreKey', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  publicKey: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('signed', 'one-time'),
    allowNull: false,
  },
  signature: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  isUsed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  timestamps: true,
});

PreKey.associate = (models) => {
  PreKey.belongsTo(models.User, { foreignKey: 'userId' });
};

module.exports = PreKey;
