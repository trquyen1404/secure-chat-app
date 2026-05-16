const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Resource = sequelize.define('Resource', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  fileUrl: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  fileType: {
    type: DataTypes.STRING, // 'pdf', 'doc', 'ppt', 'xls', 'img', 'link'
    allowNull: false,
  },
  fileSize: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  category: {
    type: DataTypes.STRING,
    defaultValue: 'General', // e.g. 'Slides', 'Ebooks', 'Lab Manuals'
  },
  isPinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  }
}, {
  timestamps: true,
});

Resource.associate = (models) => {
  Resource.belongsTo(models.Group, { foreignKey: 'groupId' });
  Resource.belongsTo(models.User, { foreignKey: 'userId', as: 'Uploader' });
};

module.exports = Resource;
