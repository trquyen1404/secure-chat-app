const { User } = require('../models');
const sequelize = require('../config/database');

async function listUsers() {
  try {
    await sequelize.authenticate();
    const users = await User.findAll({ attributes: ['username'] });
    console.log('Existing users:', users.map(u => u.username));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

listUsers();
