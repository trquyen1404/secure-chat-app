const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StudyPost = sequelize.define('StudyPost', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING, // 'open', 'closed'
    defaultValue: 'open',
  }
}, {
  timestamps: true,
});

StudyPost.associate = (models) => {
  StudyPost.belongsTo(models.User, { foreignKey: 'userId', as: 'Author' });
};

module.exports = StudyPost;
