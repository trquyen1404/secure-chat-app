/**
 * dbReset.js — A script to PERMANENTLY DELETE all data and clear the schema.
 * Use with extreme caution.
 */

const sequelize = require('../config/database');
const path = require('path');
const fs = require('fs');

// Import all models so Sequelize knows about them
const User = require('../models/User');
const Message = require('../models/Message');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const PreKey = require('../models/PreKey');
const GroupMessage = require('../models/GroupMessage');

async function resetDatabase() {
  console.log('--- DATABASE RESET INITIATED ---');
  try {
    // Authenticate first
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // FORCE SYNC: Drops all tables and recreates them
    await sequelize.sync({ force: true });
    console.log('SUCCESS: All tables dropped and recreated (force: true).');
    
    console.log('--- DATABASE RESET COMPLETED ---');
    process.exit(0);
  } catch (error) {
    console.error('FAILED to reset database:', error);
    process.exit(1);
  }
}

resetDatabase();
