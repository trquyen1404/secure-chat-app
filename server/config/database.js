const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgres://postgres:123456@localhost:5432/secure_chat', 
  {
    dialect: 'postgres',
    logging: false,
  }
);

module.exports = sequelize;
