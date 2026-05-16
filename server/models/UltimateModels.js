const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// 1. Health & Wellness
const GymBooking = sequelize.define('GymBooking', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  facility: { type: DataTypes.STRING }, // Gym, Soccer, Basketball
  bookingTime: { type: DataTypes.DATE }
});
GymBooking.associate = (models) => {
  GymBooking.belongsTo(models.User, { foreignKey: 'userId' });
};

// 4. Tuition & Finance
const TuitionRecord = sequelize.define('TuitionRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  semester: { type: DataTypes.STRING },
  amount: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING } // paid, pending
});
TuitionRecord.associate = (models) => {
  TuitionRecord.belongsTo(models.User, { foreignKey: 'userId' });
};

// 13. Green Points
const GreenPoint = sequelize.define('GreenPoint', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  activity: { type: DataTypes.STRING },
  points: { type: DataTypes.INTEGER },
  date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});
GreenPoint.associate = (models) => {
  GreenPoint.belongsTo(models.User, { foreignKey: 'userId' });
};

// 14. Blood Donation
const BloodDonation = sequelize.define('BloodDonation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  donationDate: { type: DataTypes.DATE },
  location: { type: DataTypes.STRING },
  certificateNumber: { type: DataTypes.STRING }
});
BloodDonation.associate = (models) => {
  BloodDonation.belongsTo(models.User, { foreignKey: 'userId' });
};

module.exports = { GymBooking, TuitionRecord, GreenPoint, BloodDonation };
