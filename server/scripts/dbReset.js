/**
 * dbReset.js — A script to PERMANENTLY DELETE all data and clear the schema.
 * Rebuilt to use the centralized models index for stability.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
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

    // Ensure UTT Bot exists with deterministic UUID
    await db.User.findOrCreate({
      where: { username: 'utt_assistant' },
      defaults: {
        id: 'bf8ba19f-d31e-450f-90e9-b59074d2217a',
        username: 'utt_assistant',
        displayName: 'Trợ lý ảo UTT 🤖',
        email: 'assistant@utt.edu.vn',
        password: 'virtual_user_no_login',
        publicKey: 'BOT_VIRTUAL_KEY',
        dhPublicKey: 'BOT_VIRTUAL_KEY',
        role: 'bot',
        isVerified: true
      }
    });
    console.log('SUCCESS: Seeded UTT Assistant bot.');
    
    console.log('--- DATABASE RESET COMPLETED ---');
    process.exit(0);
  } catch (error) {
    console.error('FAILED to reset database:', error);
    process.exit(1);
  }
}

resetDatabase();
