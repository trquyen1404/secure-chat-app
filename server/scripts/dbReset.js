/**
 * dbReset.js — A script to PERMANENTLY DELETE all data and clear the schema.
 * Rebuilt to use the centralized models index for stability.
 */

require('dotenv').config();
const db = require('../models');

async function resetDatabase() {
  console.log('--- DATABASE RESET INITIATED ---');
  try {
    // Authenticate first
    await db.sequelize.authenticate();
    console.log('Database connection established successfully.');

    // FORCE SYNC: Drops all tables and recreates them
    // This uses the registry which has already established associations correctly.
    await db.sequelize.sync({ force: true });
    console.log('SUCCESS: All tables dropped and recreated (force: true).');
    
    console.log('--- DATABASE RESET COMPLETED ---');
    process.exit(0);
  } catch (error) {
    console.error('FAILED to reset database:', error);
    process.exit(1);
  }
}

resetDatabase();
