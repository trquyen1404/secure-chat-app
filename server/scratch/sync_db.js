const db = require('../models');

async function syncDatabase() {
  try {
    await db.sequelize.authenticate();
    console.log('Connected to database.');
    
    // alter: true will attempt to modify the tables to match the model without dropping them
    await db.sequelize.sync({ alter: true });
    console.log('Database synchronized (alter: true).');
    process.exit(0);
  } catch (error) {
    console.error('Failed to sync database:', error);
    process.exit(1);
  }
}

syncDatabase();
