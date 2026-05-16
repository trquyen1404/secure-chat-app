const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Assignment = sequelize.define('Assignment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  teacherId: {
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
  deadline: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  fileUrl: {
    type: DataTypes.STRING, // Teacher's reference file
    allowNull: true,
  },
  points: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
  }
}, {
  timestamps: true,
});

Assignment.associate = (models) => {
  Assignment.belongsTo(models.Group, { foreignKey: 'groupId' });
  Assignment.belongsTo(models.User, { foreignKey: 'teacherId', as: 'Teacher' });
  Assignment.hasMany(models.Submission, { foreignKey: 'assignmentId', as: 'Submissions' });
};

module.exports = Assignment;
