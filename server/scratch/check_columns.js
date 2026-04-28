const { User } = require('../models');
const sequelize = require('../config/database');

async function checkColumns() {
  try {
    await sequelize.authenticate();
    const attributes = await User.describe();
    console.log('User table attributes:', Object.keys(attributes));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkColumns();
