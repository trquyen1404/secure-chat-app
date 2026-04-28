const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AttendanceRecord = sequelize.define('AttendanceRecord', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  sessionId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  scannedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  signature: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  deviceInfo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['sessionId', 'userId']
    }
  ]
});

AttendanceRecord.associate = (models) => {
  AttendanceRecord.belongsTo(models.AttendanceSession, { foreignKey: 'sessionId' });
  AttendanceRecord.belongsTo(models.User, { foreignKey: 'userId' });
};

module.exports = AttendanceRecord;
