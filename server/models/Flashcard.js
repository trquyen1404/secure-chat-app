const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Flashcard = sequelize.define('Flashcard', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  setId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  front: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  back: {
    type: DataTypes.TEXT,
    allowNull: false,
  }
}, {
  timestamps: true,
});

Flashcard.associate = (models) => {
  Flashcard.belongsTo(models.FlashcardSet, { foreignKey: 'setId' });
};

module.exports = Flashcard;
