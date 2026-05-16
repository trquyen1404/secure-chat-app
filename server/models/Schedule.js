const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Schedule = sequelize.define('Schedule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  subjectName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  dayOfWeek: {
    type: DataTypes.INTEGER, // 0 (Sun) to 6 (Sat)
    allowNull: false,
  },
  startTime: {
    type: DataTypes.STRING, // "HH:mm"
    allowNull: false,
  },
  endTime: {
    type: DataTypes.STRING, // "HH:mm"
    allowNull: false,
  },
  room: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  teacherName: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  timestamps: true,
});

Schedule.associate = (models) => {
  Schedule.belongsTo(models.User, { foreignKey: 'userId' });
};

module.exports = Schedule;
