const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// 11. Elections
const Election = sequelize.define('Election', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  candidates: { type: DataTypes.JSONB, defaultValue: [] }, // [{ name, id, votes: 0 }]
  voterIds: { type: DataTypes.JSONB, defaultValue: [] }
});

// 12. Event Tickets
const EventTicket = sequelize.define('EventTicket', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  eventName: { type: DataTypes.STRING, allowNull: false },
  qrCode: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'valid' } // valid, used
});
EventTicket.associate = (models) => {
  EventTicket.belongsTo(models.User, { foreignKey: 'userId' });
};

// 15. Expense Tracker
const Expense = sequelize.define('Expense', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.INTEGER, allowNull: false },
  category: { type: DataTypes.STRING }, // food, rent, books, etc.
  date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});
Expense.associate = (models) => {
  Expense.belongsTo(models.User, { foreignKey: 'userId' });
};

// 17. Learning Diary
const DiaryEntry = sequelize.define('DiaryEntry', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  aiAnalysis: { type: DataTypes.TEXT }
});
DiaryEntry.associate = (models) => {
  DiaryEntry.belongsTo(models.User, { foreignKey: 'userId' });
};

module.exports = { Election, EventTicket, Expense, DiaryEntry };
