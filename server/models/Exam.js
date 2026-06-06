const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Exam = sequelize.define('Exam', {
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
  durationMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 60,
  }
}, {
  timestamps: true,
});

Exam.associate = (models) => {
  Exam.belongsTo(models.Group, { foreignKey: 'groupId' });
  Exam.hasMany(models.Question, { foreignKey: 'examId', as: 'Questions', onDelete: 'CASCADE' });
};

module.exports = Exam;
