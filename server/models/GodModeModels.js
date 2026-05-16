const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// 7. UTT Token / Points
const UserWallet = sequelize.define('UserWallet', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  balance: { type: DataTypes.INTEGER, defaultValue: 0 },
  transactionHistory: { type: DataTypes.JSONB, defaultValue: [] }
});

// 11. Accommodation Finder
const Accommodation = sequelize.define('Accommodation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING },
  price: { type: DataTypes.STRING },
  location: { type: DataTypes.STRING },
  isEmergency: { type: DataTypes.BOOLEAN, defaultValue: false }
});

// 12. Meal Share
const MealListing = sequelize.define('MealListing', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING },
  quantity: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING, defaultValue: 'available' }
});

// 13. Crowdfunding
const Campaign = sequelize.define('Campaign', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  creatorId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING },
  targetAmount: { type: DataTypes.INTEGER },
  currentAmount: { type: DataTypes.INTEGER, defaultValue: 0 },
  backers: { type: DataTypes.JSONB, defaultValue: [] }
});

module.exports = { UserWallet, Accommodation, MealListing, Campaign };
