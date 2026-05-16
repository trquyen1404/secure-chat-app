const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Friend = sequelize.define('Friend', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  requesterId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  recipientId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending', // 'pending', 'accepted', 'rejected'
  }
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['requesterId', 'recipientId']
    }
  ]
});

Friend.associate = (models) => {
  Friend.belongsTo(models.User, { as: 'Requester', foreignKey: 'requesterId' });
  Friend.belongsTo(models.User, { as: 'Recipient', foreignKey: 'recipientId' });
};

module.exports = Friend;
