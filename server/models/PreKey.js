const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const PreKey = sequelize.define('PreKey', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: User, key: 'id' }
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
  }
}, {
  timestamps: true,
});

User.hasMany(PreKey, { foreignKey: 'userId', as: 'PreKeys' });
PreKey.belongsTo(User, { foreignKey: 'userId' });

module.exports = PreKey;
