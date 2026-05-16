const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PushSubscription = sequelize.define('PushSubscription', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  subscription: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  deviceInfo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
});

PushSubscription.associate = (models) => {
  PushSubscription.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
};

module.exports = PushSubscription;
