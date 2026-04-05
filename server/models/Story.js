const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Story = sequelize.define('Story', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  content: { // For simple text stories or captions
    type: DataTypes.TEXT,
    allowNull: true,
  },
  mediaUrl: { // Could be base64 string or an actual URL
    type: DataTypes.TEXT,
    allowNull: true,
  },
  mediaType: { // 'image', 'video', 'text'
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'text',
  },
}, {
  timestamps: true,
});

// Relationships
User.hasMany(Story, { foreignKey: 'userId', as: 'Stories' });
Story.belongsTo(User, { foreignKey: 'userId', as: 'Author' });

module.exports = Story;
