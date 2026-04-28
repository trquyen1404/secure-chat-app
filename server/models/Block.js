const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Block = sequelize.define('Block', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  blockerId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  blockedId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['blockerId', 'blockedId']
    }
  ]
});

Block.associate = (models) => {
  Block.belongsTo(models.User, { foreignKey: 'blockerId', as: 'Blocker' });
  Block.belongsTo(models.User, { foreignKey: 'blockedId', as: 'BlockedUser' });
};

module.exports = Block;
