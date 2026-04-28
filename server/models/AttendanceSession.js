const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AttendanceSession = sequelize.define('AttendanceSession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  creatorId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  sessionData: {
    type: DataTypes.TEXT, // Encrypted or signed data for QR
    allowNull: true,
  },
}, {
  timestamps: true,
});

AttendanceSession.associate = (models) => {
  AttendanceSession.belongsTo(models.Group, { foreignKey: 'groupId' });
  AttendanceSession.belongsTo(models.User, { foreignKey: 'creatorId', as: 'Creator' });
  AttendanceSession.hasMany(models.AttendanceRecord, { foreignKey: 'sessionId', as: 'Records' });
};

module.exports = AttendanceSession;
