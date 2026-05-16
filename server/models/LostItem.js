const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LostItem = sequelize.define('LostItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  location: {
    type: DataTypes.STRING, // e.g. "Tòa nhà A2, Phòng 301"
    allowNull: true,
  },
  type: {
    type: DataTypes.STRING, // 'lost' or 'found'
    defaultValue: 'found',
  },
  status: {
    type: DataTypes.STRING, // 'active', 'returned'
    defaultValue: 'active',
  },
  imageUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
  }
}, {
  timestamps: true,
});

LostItem.associate = (models) => {
  LostItem.belongsTo(models.User, { foreignKey: 'userId', as: 'Reporter' });
};

module.exports = LostItem;
