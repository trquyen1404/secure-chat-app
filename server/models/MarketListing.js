const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MarketListing = sequelize.define('MarketListing', {
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
  price: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  type: {
    type: DataTypes.STRING, // 'sell', 'give', 'buy'
    defaultValue: 'sell',
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  imageUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING, // 'active', 'sold'
    defaultValue: 'active',
  }
}, {
  timestamps: true,
});

MarketListing.associate = (models) => {
  MarketListing.belongsTo(models.User, { foreignKey: 'userId', as: 'Seller' });
};

module.exports = MarketListing;
