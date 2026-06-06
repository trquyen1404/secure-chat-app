const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FlashcardSet = sequelize.define('FlashcardSet', {
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
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  }
}, {
  timestamps: true,
});

FlashcardSet.associate = (models) => {
  FlashcardSet.belongsTo(models.Group, { foreignKey: 'groupId' });
  FlashcardSet.belongsTo(models.User, { foreignKey: 'userId' });
  FlashcardSet.hasMany(models.Flashcard, { foreignKey: 'setId', as: 'Cards', onDelete: 'CASCADE' });
};

module.exports = FlashcardSet;
