const { User } = require('./models');
const sequelize = require('./config/database');

async function check() {
  try {
    const tableInfo = await sequelize.getQueryInterface().describeTable('Users');
    console.log('Table Users Columns:', Object.keys(tableInfo));
    process.exit(0);
  } catch (err) {
    console.error('Error describing table:', err.message);
    process.exit(1);
  }
}

check();
